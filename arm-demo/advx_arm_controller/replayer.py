#!/usr/bin/env python3

import json
import time

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped
from sensor_msgs.msg import JointState


class PosPlayer(Node):

    def __init__(self):
        super().__init__("pos_player")

        self.publisher = self.create_publisher(
            PoseStamped,
            "/control/move_p",
            10,
        )
        self.gripper_pub = self.create_publisher(
            JointState,
            "/control/joint_states",
            10,
        )

        path = "/home/hang/agx_arm_ws/src/advx_arm_controller/record/record.json"

        with open(path, "r") as f:
            self.data = json.load(f)

        self.get_logger().info(f"Loaded {path}")

    def publish_pose(self, name):
        pose = self.data[name]

        msg = PoseStamped()
        msg.header.frame_id = ""

        msg.pose.position.x = pose["position"]["x"]
        msg.pose.position.y = pose["position"]["y"]
        msg.pose.position.z = pose["position"]["z"]

        msg.pose.orientation.x = pose["orientation"]["x"]
        msg.pose.orientation.y = pose["orientation"]["y"]
        msg.pose.orientation.z = pose["orientation"]["z"]
        msg.pose.orientation.w = pose["orientation"]["w"]

        self.publisher.publish(msg)
        self.get_logger().info(f"Published {name}")

    def publish_gripper(self, position=0.02):
        msg = JointState()

        msg.name = ["gripper"]
        msg.position = [position]
        msg.velocity = [0.0]
        msg.effort = [0.5]

        for _ in range(20):
            self.gripper_pub.publish(msg)

        self.get_logger().info(f"Gripper -> {position}")

def main(args=None):
    rclpy.init(args=args)

    node = PosPlayer()

    try:
        input("Press Enter -> waiting_pos")
        node.publish_gripper(0.07)
        node.publish_pose("ring_up")
        node.publish_pose("ring_up")

        input("put")
        node.publish_pose("ring")
        node.publish_pose("ring")
        node.publish_pose("ring")

        input("put")
        node.publish_gripper(0.02)
        node.publish_gripper(0.02)
        node.publish_pose("ring")
        node.publish_pose("ring")
        node.publish_pose("ring")

        input("put")
        node.publish_pose("ring_up")
        node.publish_pose("ring_up")
        node.publish_pose("ring_up")

        input("Press Enter -> ready_pos")
        node.publish_pose("ready_pos")


        input("Waiting 1 second...")
        node.publish_pose("put_pos")

        print("Done.")

    except KeyboardInterrupt:
        pass

    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()