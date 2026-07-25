#!/usr/bin/env python3
# bringup.launch.py
#
# 一键启动：机械臂 + 相机 + gripper_base->camera_link 静态 TF + ring_detector

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node
import os


def generate_launch_description():
    arm_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('agx_arm_ctrl'),
                'launch', 'start_single_agx_arm_rviz.launch.py')),
        launch_arguments={
            'can_port': 'can0',
            'arm_type': 'piper',
            'follow': 'true',
            'control': 'false',
            'effector_type': 'agx_gripper',
            'speed_percent': '100',
        }.items(),
    )

    camera_launch = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(
            os.path.join(
                get_package_share_directory('orbbec_camera'),
                'launch', 'dabai.launch.py')),
        launch_arguments={
            'depth_registration': 'true',
            'enable_accel': 'false',
            'enable_gyro': 'false',
            'tf_publish_rate': '500.0',
        }.items(),
    )

    static_tf = Node(
        package='tf2_ros',
        executable='static_transform_publisher',
        name='gripper_camera_static_tf',
        arguments=[
            '--x', '-0.0775', '--y', '0.036', '--z', '0.03832',
            '--qx', '0.0', '--qy', '-0.57352', '--qz', '0.0', '--qw', '0.81919',
            '--frame-id', 'gripper_base', '--child-frame-id', 'camera_link',
        ],
    )

    ring_detector = Node(
        package='advx_arm_controller',
        executable='ring_detector',
        name='ring_detector',
        output='screen',
    )

    return LaunchDescription([
        arm_launch,
        camera_launch,
        static_tf,
        ring_detector,
    ])
