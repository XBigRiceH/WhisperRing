#!/usr/bin/env python3

import json
import os
import threading

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped


class PosRecorder(Node):
    def __init__(self):
        super().__init__("pos_recorder")

        self.subscription = self.create_subscription(
            PoseStamped,
            "/feedback/tcp_pose",
            self.pose_callback,
            10,
        )

        self.latest_pose = None
        self.records = {}
        self.names = [
            "ready_pos",
            "put_pos",
            "love_pos",
        ]

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

    def keyboard_thread(self):

        input(f"\nPress Enter to record ring...")
        while self.latest_pose is None:
            self.get_logger().info("Waiting for first Pose...")
            rclpy.spin_once(self, timeout_sec=0.1)
        self.records['ring'] = self.pose_to_dict(self.latest_pose)
        self.get_logger().info(
            f"ring recorded:\n"
            f"  position = ({self.latest_pose.pose.position.x:.6f}, "
            f"{self.latest_pose.pose.position.y:.6f}, "
            f"{self.latest_pose.pose.position.z:.6f})"
        )

        pose2 = self.latest_pose
        pose2.pose.position.z += 0.1
        self.records['ring_up'] = self.pose_to_dict(pose2)
        self.get_logger().info(
            f"ringup recorded:\n"
            f"  position = ({pose2.pose.position.x:.6f}, "
            f"{pose2.pose.position.y:.6f}, "
            f"{pose2.pose.position.z:.6f})"
        )

        for name in self.names:
            input(f"\nPress Enter to record {name}...")
            while self.latest_pose is None:
                self.get_logger().info("Waiting for first Pose...")
                rclpy.spin_once(self, timeout_sec=0.1)
            self.records[name] = self.pose_to_dict(self.latest_pose)
            self.get_logger().info(
                f"{name} recorded:\n"
                f"  position = ({self.latest_pose.pose.position.x:.6f}, "
                f"{self.latest_pose.pose.position.y:.6f}, "
                f"{self.latest_pose.pose.position.z:.6f})"
            )
        save_path = "/home/hang/agx_arm_ws/src/advx_arm_controller/record/record.json"
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "w") as f:
            json.dump(self.records, f, indent=4)
        self.get_logger().info(f"Saved to {save_path}")
        rclpy.shutdown()

def main(args=None):
    rclpy.init(args=args)
    node = PosRecorder()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass

    node.destroy_node()


if __name__ == "__main__":
    main()