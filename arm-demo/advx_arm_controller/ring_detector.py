#!/usr/bin/env python3
# ring_detector.py
#
# YOLO 戒指检测 + 深度测距 ROS2 节点（Python 版，检测器换成 ultralytics YOLO）：
#   1. 订阅 /camera/color/image_raw + /camera/color/camera_info、
#      /camera/depth/image_raw + /camera/depth/camera_info（深度与彩色分辨率
#      未对齐，各自使用自己的内参），以及 /camera/depth_to_color 外参
#      （orbbec_camera_msgs/Extrinsics，P_color = R * P_depth + t，t 单位米）；
#   2. 在彩色图上用 YOLO(best.pt) 检测戒指，取置信度最高的 bbox；
#   3. 深度图子采样反投影 -> 外参变换到 color 光学系 -> 彩色内参（含畸变）
#      投影回彩色像素，按 bbox 内归一化半径分类为“中心孔洞点”/“环体点”；
#   4. 目标点 = 戒指中心正下方底面上的 3D 点：
#      用环体上表面深度点拟合上平面，沿法线（远离相机方向）下移
#      ring_height（默认 9mm）得到底面，再与过 bbox 中心的视线求交；
#      环体点不足时退化为孔洞内支撑面（底面与桌面共面，无需下移）；
#   5. ring 永远平放在 world 系：若能查到 world->camera TF，用 world 的 z 轴
#      作为平面法线（降维，只需估一个标量偏移），拟合更稳；
#   6. 发布 PoseStamped / debug_image，并广播 TF:
#      camera_color_optical_frame -> ring。

import math

import cv2
import numpy as np
import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy

from ament_index_python.packages import get_package_share_directory
from cv_bridge import CvBridge
from message_filters import ApproximateTimeSynchronizer, Subscriber

from geometry_msgs.msg import PointStamped, PoseStamped, TransformStamped
from sensor_msgs.msg import CameraInfo, Image
from orbbec_camera_msgs.msg import Extrinsics

import tf2_ros


def quat_to_rot(x, y, z, w):
    """四元数 -> 3x3 旋转矩阵"""
    n = math.sqrt(x * x + y * y + z * z + w * w)
    if n < 1e-12:
        return np.eye(3)
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


class PinholeModel:
    """针孔相机模型（fx fy cx cy + OpenCV 畸变），numpy 批量投影"""

    def __init__(self):
        self.fx = self.fy = self.cx = self.cy = 0.0
        self.d = np.zeros(8)
        self.K = None

    def from_info(self, info: CameraInfo):
        k = np.asarray(info.k, dtype=np.float64).reshape(3, 3)
        self.fx, self.fy = k[0, 0], k[1, 1]
        self.cx, self.cy = k[0, 2], k[1, 2]
        self.K = k
        d = np.zeros(8)
        dd = np.asarray(info.d, dtype=np.float64).ravel()
        d[:min(8, dd.size)] = dd[:min(8, dd.size)]
        self.d = d

    def valid(self):
        return self.fx > 0.0 and self.fy > 0.0

    def project(self, pts):
        """pts: (N,3) 本相机光学系 3D 点 -> (N,2) 像素（含畸变），z<=0 得 NaN"""
        z = pts[:, 2]
        ok = z > 1e-6
        x = np.where(ok, pts[:, 0] / np.where(ok, z, 1.0), np.nan)
        y = np.where(ok, pts[:, 1] / np.where(ok, z, 1.0), np.nan)
        k1, k2, p1, p2, k3, k4, k5, k6 = self.d
        r2 = x * x + y * y
        num = 1.0 + r2 * (k1 + r2 * (k2 + r2 * k3))
        den = 1.0 + r2 * (k4 + r2 * (k5 + r2 * k6))
        radial = np.where(np.abs(den) > 1e-9, num / den, 1.0)
        xd = x * radial + 2.0 * p1 * x * y + p2 * (r2 + 2.0 * x * x)
        yd = y * radial + p1 * (r2 + 2.0 * y * y) + 2.0 * p2 * x * y
        return np.stack([self.fx * xd + self.cx, self.fy * yd + self.cy], axis=1)

    def ray(self, u, v):
        """像素 -> 归一化视线方向 (x, y, 1)（去畸变）"""
        pt = np.array([[[float(u), float(v)]]], dtype=np.float64)
        und = cv2.undistortPoints(pt, self.K, self.d[:5].reshape(1, 5))
        return np.array([und[0, 0, 0], und[0, 0, 1], 1.0])


class YoloRingDetector(Node):

    def __init__(self):
        super().__init__('yolo_ring_detector')
        self._declare_parameters()

        # 延迟加载 ultralytics（import 较慢）
        from ultralytics import YOLO
        model_path = self.get_parameter('model_path').value
        if not model_path:
            model_path = get_package_share_directory(
                'advx_arm_controller') + '/models/best.pt'
        self.model = YOLO(model_path)
        self.get_logger().info(f'YOLO model loaded: {model_path}')

        self.bridge = CvBridge()
        self.color_model = PinholeModel()
        self.depth_model = PinholeModel()
        self.d2c_R = None      # 3x3
        self.d2c_t = None      # (3,)
        self.color_frame = 'camera_color_optical_frame'

        self.tf_buffer = tf2_ros.Buffer()
        self.tf_listener = tf2_ros.TransformListener(self.tf_buffer, self)
        self.tf_broadcaster = tf2_ros.TransformBroadcaster(self)

        # 相机内参（只需最新一帧）
        self.create_subscription(
            CameraInfo, self.get_parameter('color_info_topic').value,
            lambda m: self.color_model.from_info(m), 10)
        self.create_subscription(
            CameraInfo, self.get_parameter('depth_info_topic').value,
            lambda m: self.depth_model.from_info(m), 10)

        # 外参由 orbbec 驱动以 transient_local 发布一次（latched）
        ext_qos = QoSProfile(depth=1)
        ext_qos.durability = DurabilityPolicy.TRANSIENT_LOCAL
        self.create_subscription(
            Extrinsics, self.get_parameter('extrinsics_topic').value,
            self._extrinsics_cb, ext_qos)

        # 彩色 + 深度近似时间同步
        color_sub = Subscriber(
            self, Image, self.get_parameter('color_image_topic').value)
        depth_sub = Subscriber(
            self, Image, self.get_parameter('depth_image_topic').value)
        self.sync = ApproximateTimeSynchronizer(
            [color_sub, depth_sub], queue_size=5, slop=0.1)
        self.sync.registerCallback(self._images_cb)

        self.pose_pub = self.create_publisher(PoseStamped, 'yolo_ring/pose', 10)
        self.pose_world_pub = self.create_publisher(
            PoseStamped, 'yolo_ring/pose_world', 10)
        self.point_pub = self.create_publisher(
            PointStamped, 'yolo_ring/point', 10)
        self.debug_pub = self.create_publisher(
            Image, 'yolo_ring/debug_image', 2)

        self.get_logger().info('yolo_ring_detector (YOLO detect + depth ranging) started.')

    def _declare_parameters(self):
        self.declare_parameter('model_path', '')
        self.declare_parameter('conf_threshold', 0.5)
        self.declare_parameter('color_image_topic', '/camera/color/image_raw')
        self.declare_parameter('depth_image_topic', '/camera/depth/image_raw')
        self.declare_parameter('color_info_topic', '/camera/color/camera_info')
        self.declare_parameter('depth_info_topic', '/camera/depth/camera_info')
        self.declare_parameter('extrinsics_topic', '/camera/depth_to_color')
        self.declare_parameter('depth_scale', 0.001)   # 16UC1 -> m
        self.declare_parameter('depth_stride', 2)      # 深度图子采样步长
        self.declare_parameter('min_depth', 0.05)
        self.declare_parameter('max_depth', 2.0)
        self.declare_parameter('ring_height', 0.009)   # 戒指厚度 9mm
        self.declare_parameter('ring_inner_diameter', 0.020)
        self.declare_parameter('ring_outer_diameter', 0.028)
        self.declare_parameter('surface_band', 0.008)  # 上表面深度聚类带宽
        self.declare_parameter('min_body_points', 8)
        self.declare_parameter('min_hole_points', 5)
        self.declare_parameter('bbox_expand', 1.3)     # 采样时 bbox 外扩系数
        self.declare_parameter('use_world_normal', True)
        self.declare_parameter('world_frame', 'world')
        self.declare_parameter('ring_frame', 'ring')
        self.declare_parameter('publish_tf', True)
        self.declare_parameter('publish_debug_image', True)

    # ------------------------------------------------------------------ util

    def _extrinsics_cb(self, msg: Extrinsics):
        self.d2c_R = np.asarray(msg.rotation, dtype=np.float64).reshape(3, 3)
        self.d2c_t = np.asarray(msg.translation, dtype=np.float64)
        self.get_logger().info(
            'depth_to_color extrinsics received (t = %.4f %.4f %.4f m)' %
            (self.d2c_t[0], self.d2c_t[1], self.d2c_t[2]))

    def _depth_to_meters(self, depth_msg: Image):
        depth = self.bridge.imgmsg_to_cv2(depth_msg, desired_encoding='passthrough')
        if depth.dtype == np.uint16:
            return depth.astype(np.float32) * float(
                self.get_parameter('depth_scale').value)
        return depth.astype(np.float32)

    def _world_up_in_camera(self, stamp):
        """world z 轴在 color 光学系下的方向（ring 平放约束的降维法线）"""
        if not self.get_parameter('use_world_normal').value:
            return None
        try:
            tf = self.tf_buffer.lookup_transform(
                self.color_frame, self.get_parameter('world_frame').value,
                rclpy.time.Time())
            q = tf.transform.rotation
            R_cw = quat_to_rot(q.x, q.y, q.z, q.w)
            return R_cw[:, 2]  # world +z 在相机系中的方向
        except Exception:
            return None

    def _world_quat_in_camera(self):
        """world 系姿态在 color 光学系下的四元数（使 ring 在 world 系 rpy 恒为 0）"""
        try:
            tf = self.tf_buffer.lookup_transform(
                self.color_frame, self.get_parameter('world_frame').value,
                rclpy.time.Time())
            return tf.transform.rotation
        except Exception:
            return None

    # ------------------------------------------------------------- pipeline

    def _images_cb(self, color_msg: Image, depth_msg: Image):
        if (not self.color_model.valid() or not self.depth_model.valid() or
                self.d2c_R is None):
            self.get_logger().warn(
                'Waiting for calibration: color_info=%d depth_info=%d extrinsics=%d' %
                (self.color_model.valid(), self.depth_model.valid(),
                 self.d2c_R is not None),
                throttle_duration_sec=5.0)
            return
        if color_msg.header.frame_id:
            self.color_frame = color_msg.header.frame_id

        bgr = self.bridge.imgmsg_to_cv2(color_msg, desired_encoding='bgr8')
        debug = bgr.copy() if self.get_parameter('publish_debug_image').value else None

        # 1) YOLO 检测，取置信度最高的框
        conf = float(self.get_parameter('conf_threshold').value)
        results = self.model.predict(bgr, conf=conf, verbose=False)
        box = None
        best_conf = 0.0
        for r in results:
            if r.boxes is None:
                continue
            for b in r.boxes:
                c = float(b.conf[0])
                if c > best_conf:
                    best_conf = c
                    box = b.xyxy[0].cpu().numpy()
        if box is None:
            self._publish_debug(debug, color_msg)
            return

        x1, y1, x2, y2 = box
        ucx, vcy = 0.5 * (x1 + x2), 0.5 * (y1 + y2)
        half_w, half_h = max(1.0, 0.5 * (x2 - x1)), max(1.0, 0.5 * (y2 - y1))
        if debug is not None:
            cv2.rectangle(debug, (int(x1), int(y1)), (int(x2), int(y2)),
                          (0, 255, 0), 2)
            cv2.circle(debug, (int(ucx), int(vcy)), 4, (0, 255, 255), -1)
            cv2.putText(debug, f'ring {best_conf:.2f}', (int(x1), int(y1) - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # 2) 深度图子采样反投影 -> color 光学系 -> 彩色像素
        depth = self._depth_to_meters(depth_msg)
        stride = int(self.get_parameter('depth_stride').value)
        z = depth[::stride, ::stride]
        h, w = z.shape
        us, vs = np.meshgrid(
            np.arange(0, w * stride, stride, dtype=np.float64),
            np.arange(0, h * stride, stride, dtype=np.float64))
        zf = z.ravel().astype(np.float64)
        valid = (zf > float(self.get_parameter('min_depth').value)) & \
                (zf < float(self.get_parameter('max_depth').value))
        zf, uf, vf = zf[valid], us.ravel()[valid], vs.ravel()[valid]
        if zf.size == 0:
            self._publish_debug(debug, color_msg)
            return
        dm = self.depth_model
        pts_d = np.stack([(uf - dm.cx) / dm.fx * zf,
                          (vf - dm.cy) / dm.fy * zf, zf], axis=1)
        pts_c = pts_d @ self.d2c_R.T + self.d2c_t
        uv = self.color_model.project(pts_c)

        # 3) bbox 内归一化椭圆半径分类：孔洞点 / 环体点
        expand = float(self.get_parameter('bbox_expand').value)
        rn = np.sqrt(((uv[:, 0] - ucx) / half_w) ** 2 +
                     ((uv[:, 1] - vcy) / half_h) ** 2)
        rn = np.where(np.isfinite(rn), rn, 1e9)
        inner_ratio = (float(self.get_parameter('ring_inner_diameter').value) /
                       max(1e-6, float(self.get_parameter('ring_outer_diameter').value)))
        body_mask = (rn >= inner_ratio) & (rn <= expand)
        hole_mask = rn <= inner_ratio * 0.8
        body_pts = pts_c[body_mask]
        hole_pts = pts_c[hole_mask]

        # 4) 环体上表面拟合 + 下移 ring_height；不足则退化为孔洞支撑面
        band = float(self.get_parameter('surface_band').value)
        min_body = int(self.get_parameter('min_body_points').value)
        min_hole = int(self.get_parameter('min_hole_points').value)
        normal = self._world_up_in_camera(color_msg.header.stamp)

        plane = None  # (n, d_bottom)，n 朝向相机，平面方程 n·P = d
        if body_pts.shape[0] >= min_body:
            zb = body_pts[:, 2]
            z0 = np.percentile(zb, 20)          # 上表面比背景更近
            top = body_pts[np.abs(zb - z0) < band]
            if top.shape[0] < max(3, min_body // 2):
                top = body_pts                  # 带内点太少时退化为全部环体点
            n, d = self._fit_plane(top, normal)
            if n is not None:
                plane = (n, d - float(self.get_parameter('ring_height').value))
        if plane is None and hole_pts.shape[0] >= min_hole:
            # 孔洞里看到的就是支撑面 = 底面，无需下移
            n, d = self._fit_plane(hole_pts, normal)
            if n is not None:
                plane = (n, d)
        if plane is None:
            self.get_logger().warn(
                'Not enough depth samples on ring (body=%d hole=%d)' %
                (body_pts.shape[0], hole_pts.shape[0]),
                throttle_duration_sec=2.0)
            self._publish_debug(debug, color_msg)
            return

        # 5) 底面平面与过 bbox 中心的视线求交
        n, d_bottom = plane
        ray = self.color_model.ray(ucx, vcy)
        denom = float(n @ ray)
        if abs(denom) < 1e-9:
            self._publish_debug(debug, color_msg)
            return
        s = d_bottom / denom
        if s <= 0.0:
            self._publish_debug(debug, color_msg)
            return
        p = s * ray  # 戒指中心正下方底面 3D 点（color 光学系）

        self._publish_result(p, n, color_msg, debug,
                             int(body_pts.shape[0]), int(hole_pts.shape[0]))

    def _fit_plane(self, pts, fixed_normal):
        """拟合平面 n·P = d，n 朝向相机。fixed_normal 给定时只估偏移 d"""
        c = pts.mean(axis=0)
        if fixed_normal is not None:
            n = fixed_normal / max(1e-12, np.linalg.norm(fixed_normal))
        else:
            _, _, vt = np.linalg.svd(pts - c, full_matrices=False)
            n = vt[2]
        if float(n @ c) > 0.0:  # 使法线朝向相机（原点）
            n = -n
        d = float(np.median(pts @ n))
        return n, d

    # ------------------------------------------------------------- publish

    def _publish_result(self, p, n, color_msg, debug, n_body, n_hole):
        # 姿态取 world 系轴向（ring 在 world 系下 rpy 恒为 0）
        pose = PoseStamped()
        pose.header.stamp = color_msg.header.stamp
        pose.header.frame_id = self.color_frame
        pose.pose.position.x = float(p[0])
        pose.pose.position.y = float(p[1])
        pose.pose.position.z = float(p[2])
        wq = self._world_quat_in_camera()
        if wq is not None:
            pose.pose.orientation = wq
        else:
            # 查不到 world TF 时退化为单位姿态
            pose.pose.orientation.w = 1.0
        self.pose_pub.publish(pose)

        # world 系下的 pose：位置经 TF 变换，姿态恒为单位四元数（rpy = 0）
        world_frame = self.get_parameter('world_frame').value
        try:
            tfw = self.tf_buffer.lookup_transform(
                world_frame, self.color_frame, rclpy.time.Time())
            q = tfw.transform.rotation
            t = tfw.transform.translation
            pw = quat_to_rot(q.x, q.y, q.z, q.w) @ p + \
                np.array([t.x, t.y, t.z])
            pose_w = PoseStamped()
            pose_w.header.stamp = color_msg.header.stamp
            pose_w.header.frame_id = world_frame
            pose_w.pose.position.x = float(pw[0])
            pose_w.pose.position.y = float(pw[1])
            pose_w.pose.position.z = float(pw[2])
            pose_w.pose.orientation.w = 1.0
            self.pose_world_pub.publish(pose_w)
        except Exception:
            self.get_logger().warn(
                'TF %s -> %s unavailable, skip pose_world' %
                (world_frame, self.color_frame),
                throttle_duration_sec=5.0)

        pt = PointStamped()
        pt.header = pose.header
        pt.point = pose.pose.position
        self.point_pub.publish(pt)

        if self.get_parameter('publish_tf').value:
            tf = TransformStamped()
            tf.header = pose.header
            tf.child_frame_id = self.get_parameter('ring_frame').value
            tf.transform.translation.x = float(p[0])
            tf.transform.translation.y = float(p[1])
            tf.transform.translation.z = float(p[2])
            tf.transform.rotation = pose.pose.orientation
            self.tf_broadcaster.sendTransform(tf)

        if debug is not None:
            uv = self.color_model.project(p.reshape(1, 3))[0]
            if np.all(np.isfinite(uv)):
                cv2.drawMarker(debug, (int(uv[0]), int(uv[1])), (0, 0, 255),
                               cv2.MARKER_CROSS, 14, 2)
            cv2.putText(debug,
                        'bottom: (%.3f, %.3f, %.3f) m' % (p[0], p[1], p[2]),
                        (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
        self._publish_debug(debug, color_msg)

        self.get_logger().info(
            'Ring bottom-center: (%.3f, %.3f, %.3f) m, hole=%d body=%d' %
            (p[0], p[1], p[2], n_hole, n_body),
            throttle_duration_sec=1.0)

    def _publish_debug(self, debug, color_msg):
        if debug is None:
            return
        # 手工组包，绕开 cv_bridge cv2_to_imgmsg 与 pip opencv 的版本冲突
        msg = Image()
        msg.header = color_msg.header
        msg.height, msg.width = debug.shape[:2]
        msg.encoding = 'bgr8'
        msg.is_bigendian = 0
        msg.step = msg.width * 3
        msg.data = np.ascontiguousarray(debug).tobytes()
        self.debug_pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = YoloRingDetector()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
