#!/usr/bin/env python3
# semiauto_recorder.py
#
# 半自动流程位置录制节点：
#   订阅 /feedback/tcp_pose，从给定列表中选择要录制的位置
#   （ring_grab_area / present_ready / present_final / heart），
#   输入名字或序号即录制该位置，无需每次全部重录，
#   结果保存到 record/semiauto-record.json（保留已有记录）。

import json
import os
import threading

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped

SAVE_PATH = "/home/hang/agx_arm_ws/src/advx_arm_controller/record/semiauto-record.json"


class SemiautoRecorder(Node):
    def __init__(self):
        super().__init__("semiauto_recorder")

        self.subscription = self.create_subscription(
            PoseStamped,
            "/feedback/tcp_pose",
            self.pose_callback,
            10,
        )

        self.latest_pose = None
        self.names = [
            "ring_grab_area",
            "present_ready",
            "present_final",
            "heart",
        ]

        # 加载已有记录，只覆盖被重录的位置
        try:
            with open(SAVE_PATH) as f:
                self.records = json.load(f)
            self.get_logger().info(
                f"Loaded existing records: {list(self.records.keys())}")
        except (OSError, json.JSONDecodeError):
            self.records = {}

        threading.Thread(target=self.keyboard_thread, daemon=True).start()
        self.get_logger().info("Waiting for /feedback/tcp_pose ...")

    def pose_callback(self, msg: PoseStamped):
        self.latest_pose = msg

    def pose_to_dict(self, pose: PoseStamped):
        return {
            "position": {
                "x": pose.pose.position.x,
                "y": pose.pose.position.y,
                "z": pose.pose.position.z,
            },
            "orientation": {
                "x": pose.pose.orientation.x,
                "y": pose.pose.orientation.y,
                "z": pose.pose.orientation.z,
                "w": pose.pose.orientation.w,
            },
        }

    def save(self):
        os.makedirs(os.path.dirname(SAVE_PATH), exist_ok=True)
        with open(SAVE_PATH, "w") as f:
            json.dump(self.records, f, indent=4)
        self.get_logger().info(f"Saved to {SAVE_PATH}")

    def keyboard_thread(self):
        while rclpy.ok():
            menu = "\n".join(
                f"  {i + 1}. {name}"
                f"{'  [recorded]' if name in self.records else ''}"
                for i, name in enumerate(self.names))
            sel = input(
                f"\nSelect position to record (name or number, q=quit):\n"
                f"{menu}\n> ").strip()

            if sel.lower() in ("q", "quit", "exit"):
                break
            if sel.isdigit() and 1 <= int(sel) <= len(self.names):
                name = self.names[int(sel) - 1]
            elif sel in self.names:
                name = sel
            else:
                print(f"Unknown position: {sel}")
                continue

            if self.latest_pose is None:
                self.get_logger().warn(
                    "No pose received on /feedback/tcp_pose yet")
                continue
            self.records[name] = self.pose_to_dict(self.latest_pose)
            self.get_logger().info(
                f"{name} recorded:\n"
                f"  position = ({self.latest_pose.pose.position.x:.6f}, "
                f"{self.latest_pose.pose.position.y:.6f}, "
                f"{self.latest_pose.pose.position.z:.6f})"
            )
            self.save()

        rclpy.shutdown()


def main(args=None):
    rclpy.init(args=args)
    node = SemiautoRecorder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass

    node.destroy_node()


if __name__ == "__main__":
    main()
