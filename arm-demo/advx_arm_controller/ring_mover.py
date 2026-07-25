#!/usr/bin/env python3
# ring_mover.py
#
# 半自动抓取/递戒指流程节点：
#   1. 订阅 /yolo_ring/pose_world，缓存最新的戒指 world 系位姿；
#   2. 订阅 /feedback/tcp_pose 与 /feedback/gripper_status，用于等待到位；
#   3. 从 record/semiauto-record.json 读取录制的
#      ring_grab_area / present_ready / present_final / heart 四个位置；
#   4. 终端按键控制流程：
#        h -> 回 ring_grab_area
#        g -> 抓取流程（下探 -> 闭合 -> 升起 -> present_ready -> present_final）
#        t -> 移动到 heart

import json
import threading
import time

import rclpy
from rclpy.node import Node

from geometry_msgs.msg import PoseStamped
from sensor_msgs.msg import JointState
from agx_arm_msgs.msg import GripperStatus

# 固定抓取姿态四元数（末端朝下）
GRAB_ORIENTATION = {
    'x': 0.000001326794896676365,
    'y': 0.9999999999982396,
    'z': 0.000001326794896676365,
    'w': 1.760384697849545e-12,
}

RECORD_PATH = "/home/hang/agx_arm_ws/src/advx_arm_controller/record/semiauto-record.json"


class RingMover(Node):

    def __init__(self):
        super().__init__('ring_mover')

        self.declare_parameter('pose_topic', '/yolo_ring/pose_world')
        self.declare_parameter('move_topic', '/control/move_p')
        self.declare_parameter('record_path', RECORD_PATH)
        self.declare_parameter('arrive_tol', 0.015)
        self.declare_parameter('arrive_timeout', 15.0)

        self._lock = threading.Lock()
        self._latest_pose = None
        self._latest_tcp = None
        self._latest_gripper = None

        # 加载录制位置
        record_path = self.get_parameter('record_path').value
        try:
            with open(record_path) as f:
                self.records = json.load(f)
            self.get_logger().info(
                'Loaded records: %s' % list(self.records.keys()))
        except (OSError, json.JSONDecodeError) as e:
            self.records = {}
            self.get_logger().error(
                'Failed to load %s: %s' % (record_path, e))

        self.create_subscription(
            PoseStamped, self.get_parameter('pose_topic').value,
            self._pose_cb, 10)
        self.create_subscription(
            PoseStamped, '/feedback/tcp_pose', self._tcp_cb, 10)
        self.create_subscription(
            GripperStatus, '/feedback/gripper_status', self._gripper_cb, 10)

        self.move_pub = self.create_publisher(
            PoseStamped, self.get_parameter('move_topic').value, 10)
        self.gripper_pub = self.create_publisher(
            JointState,
            "/control/joint_states",
            10,
        )

        self.get_logger().info(
            'ring_mover started: h=ring_grab_area  g=grab  t=heart')

    # ---------- callbacks ----------

    def _pose_cb(self, msg: PoseStamped):
        with self._lock:
            self._latest_pose = msg

    def _tcp_cb(self, msg: PoseStamped):
        with self._lock:
            self._latest_tcp = msg

    def _gripper_cb(self, msg: GripperStatus):
        with self._lock:
            self._latest_gripper = msg

    # ---------- helpers ----------

    def publish_gripper(self, position=0.02):
        msg = JointState()

        msg.name = ["gripper"]
        msg.position = [position]
        msg.velocity = [0.0]
        msg.effort = [0.5]

        for _ in range(20):
            self.gripper_pub.publish(msg)

        self.get_logger().info(f"Gripper -> {position}")

    def publish_move(self, x, y, z, orientation, frame_id=''):
        cmd = PoseStamped()
        cmd.header.stamp = self.get_clock().now().to_msg()
        cmd.header.frame_id = frame_id
        cmd.pose.position.x = float(x)
        cmd.pose.position.y = float(y)
        cmd.pose.position.z = float(z)
        cmd.pose.orientation.x = orientation['x']
        cmd.pose.orientation.y = orientation['y']
        cmd.pose.orientation.z = orientation['z']
        cmd.pose.orientation.w = orientation['w']
        self.move_pub.publish(cmd)
        self.get_logger().info(
            'move_p sent: (%.3f, %.3f, %.3f) [%s]' % (x, y, z, frame_id))
        return cmd

    def move_to_record(self, name):
        rec = self.records.get(name)
        if rec is None:
            self.get_logger().warn('No recorded pose "%s" in record file' % name)
            return None
        return self.publish_move(
            rec['position']['x'], rec['position']['y'], rec['position']['z'],
            rec['orientation'])

    def wait_arrive(self, x, y, z, check_xy=True):
        """轮询 /feedback/tcp_pose 等待末端到位。"""
        tol = float(self.get_parameter('arrive_tol').value)
        timeout = float(self.get_parameter('arrive_timeout').value)
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                tcp = self._latest_tcp
            if tcp is not None:
                dz = abs(tcp.pose.position.z - z)
                if check_xy:
                    dx = abs(tcp.pose.position.x - x)
                    dy = abs(tcp.pose.position.y - y)
                    if dx < tol and dy < tol and dz < tol:
                        return True
                elif dz < tol:
                    return True
            time.sleep(0.05)
        self.get_logger().warn('wait_arrive timeout, continue anyway')
        return False

    def wait_gripper(self, width, tol=0.011, timeout=5.0):
        """轮询 /feedback/gripper_status 等待夹爪到位（或夹到物体）。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                st = self._latest_gripper
            if st is not None and st.width <= width + tol:
                return True
            time.sleep(0.05)
        self.get_logger().warn('wait_gripper timeout, continue anyway')
        return False

    # ---------- actions ----------

    def go_grab_area(self):
        """h：回 ring_grab_area。"""
        self.move_to_record('ring_grab_area')

    def go_heart(self):
        """t：移动到 heart。"""
        self.move_to_record('heart')

    def do_grab(self):
        """g：抓取流程。"""
        with self._lock:
            pose = self._latest_pose
        if pose is None:
            self.get_logger().warn('No pose received on %s yet' %
                                   self.get_parameter('pose_topic').value)
            return
        if 'present_ready' not in self.records or \
                'present_final' not in self.records:
            self.get_logger().warn('present_ready/present_final not recorded')
            return

        x = pose.pose.position.x
        y = pose.pose.position.y
        frame = pose.header.frame_id

        # 1. 移到戒指上方 z=0.2，夹爪张开 0.1
        self.publish_gripper(0.1)
        self.publish_move(x, y, 0.2, GRAB_ORIENTATION, frame)
        self.wait_arrive(x, y, 0.2)
        time.sleep(0.5)

        # 2. 下降到 z=0.135
        self.publish_move(x, y, 0.135, GRAB_ORIENTATION, frame)
        self.wait_arrive(x, y, 0.135, check_xy=False)
        time.sleep(0.5)

        # 3. 夹爪逐渐闭合到 0.02
        griloc = 0.1
        while griloc >= 0.02:
            self.publish_gripper(griloc)
            griloc -= 0.01
            time.sleep(0.1)
        self.wait_gripper(0.02)
        time.sleep(0.5)

        # 3.5 go up
        self.publish_move(x, y, 0.2, GRAB_ORIENTATION, frame)
        self.wait_arrive(x, y, 0.2)
        time.sleep(0.5)

        # 4. 升起到 present_ready
        rec = self.records['present_ready']
        self.move_to_record('present_ready')
        self.wait_arrive(
            rec['position']['x'], rec['position']['y'], rec['position']['z'])
        time.sleep(1.0)

        # 5. 移动到 present_final
        self.move_to_record('present_final')


def main(args=None):
    rclpy.init(args=args)
    node = RingMover()

    # 后台 spin，主线程阻塞等按键
    spin_thread = threading.Thread(
        target=rclpy.spin, args=(node,), daemon=True)
    spin_thread.start()

    try:
        while rclpy.ok():
            key = input('h=grab_area  g=grab  t=heart r=release (Ctrl+C to quit) > ')
            key = key.strip().lower()
            if key == 'h':
                node.go_grab_area()
            elif key == 'g':
                node.do_grab()
            elif key == 't':
                node.go_heart()
            elif key == 'r':
                node.publish_gripper(0.1)
            elif key:
                node.get_logger().warn('Unknown command: %s' % key)
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        rclpy.try_shutdown()
        spin_thread.join(timeout=2.0)
        node.destroy_node()


if __name__ == '__main__':
    main()
