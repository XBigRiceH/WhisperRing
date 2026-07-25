from setuptools import find_packages, setup

package_name = 'advx_arm_controller'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/record', ['record/.gitkeep']),
        ('share/' + package_name + '/launch', ['launch/bringup.launch.py']),
        ('share/' + package_name + '/models', ['models/best.pt', 'models/main.py']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='hang',
    maintainer_email='hang@todo.todo',
    description='TODO: Package description',
    license='TODO: License declaration',
    extras_require={
        'test': [
            'pytest',
        ],
    },
    entry_points={
        'console_scripts': [
            'recorder = advx_arm_controller.recorder:main',
            'semiauto_recorder = advx_arm_controller.semiauto_recorder:main',
            'replayer = advx_arm_controller.replayer:main',
            'ring_detector = advx_arm_controller.ring_detector:main',
            'ring_mover = advx_arm_controller.ring_mover:main',
        ],
    },
)
