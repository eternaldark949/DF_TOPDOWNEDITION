# eternaldark949 >> 3.3.2023
# this script is designed to be a base starter for a game made in UPBGE 0.3
# the script is designed to run all game logistics, functions and preliminaries in an efficient and modular style
# all functions herein are written to function as independently as possible, however I will write notes where they are interdependent

import aud # the audio handling module
import bge # the blender game engine module
import bpy # the blender system module
import datetime # the date/time handling module
import glob # the file handling module
import itertools # the efficient looping for iterables module
import math
import mathutils
# import pyglet
# pyglet.options['headless'] = True
import numpy
import os # the operating system module
import random # the random for math module
import shutil # the more powerful file handling module
import sys # the other operating system module
import time # the time module
import urllib.request # the network and online file handling 
import zipfile # the zip file extraction module

class g7Engine: # class wrapper for the g7 game engine

    def __init__(self): # initialize the g7Engine class

        self.elements = self.g7Elements(self) # this encapsulates all elements that can be used by the game engine
        self.systems = self.g7Systems(self) # this encapsulates all systems that can be used by the game engine
        self.tools = self.g7Tools() # this encapsulates all tools that can be used by the game engine

        self.rain_drops = []

        # ENGINE DEFAULT VARIABLES

        self.FEATURE_ACTIVE = 1
        self.FEATURE_INACTIVE = 0
        self.X_POSITIVE = 0
        self.Y_POSITIVE = 1
        self.Z_POSITIVE = 2
        self.X_NEGATIVE = -0
        self.Y_NEGATIVE = -1
        self.Z_POSITIVE = -2
        self.VECTOR_GLOBAL_X_POSITIVE = (1.0, 0.0, 0.0)
        self.VECTOR_GLOBAL_X_NEGATIVE = (-1.0, 0.0, 0.0)
        self.VECTOR_GLOBAL_Y_POSITIVE = (0.0, 1.0, 0.0)
        self.VECTOR_GLOBAL_Y_NEGATIVE = (0.0, -1.0, 0.0)
        self.VECTOR_GLOBAL_Y_POSITIVE = (0.0, 1.0, 0.0)        
        self.VECTOR_GLOBAL_Z_POSITIVE = (0, 0, 1.0)
        self.VECTOR_GLOBAL_Z_NEGATIVE = (0, 0, -1.0)

        self.mouse = bge.logic.mouse # assign the mouse device that the engine will be using
        self.keyboard = bge.logic.keyboard

    def saveEngineState(self): # define the method saveEngineState, which saves the current state of the engine including all class instances of systems, tools and elements

        pass

    def saveGame(self): # define the method saveGame, which saves the game state, including player location, stats, and story progress

        pass

    def setCursorPosition(self, position=(0.5, 0.5)): # define the method setCursorPosition, which set the mouse cursor to a determined position on the screen

        self.mouse.position = position # set the mouse cursor position

    class g7Elements: # class wrapper for game engine elements; these are object types that can be accessed and used by the engine

        def __init__(self, parent_engine): # initialize the g7Elements class

            self.parent_engine = parent_engine

            self.active_instances = [] # a list of all active element instances currently running
            self.active_characters = [] # a list of all active characters currently running
            self.active_character_ids = [] # a list of all active character ids to prevent duplication and memory overload
            self.active_vehicles = [] # a list of all active vehicles currently running
            self.active_vehicle_ids = [] # a list of all active vehicle ids to prevent duplication and memory overload
            self.active_cameras = [] # a list of all active cameras currently running
            self.active_camera_ids = [] # a list of all active camera ids to prevent duplication and memory overload
            self.parkour_points = []
            self.parkour_nodes = []
            self.parkour_paths = []
            self.parkour_obstacles = []
            self.instances = [] # a list of all instances currently running, both active and inactive
            self.interactables = [] # a list of all interactable objects currently running
            self.main_camera = None # assign the main camera to be used by the engine

            # self.VEHICLE_LADYBM_VONE = (4.4, 10.0, 2.0, 35.0, 0.10) # default stats for LADY BLACKMARK (tire_friction, supension_compression, suspension_damping, suspension_stiffness, roll_influence)
            self.VEHICLE_LADYBM_VONE = (4.4, 35.0, 2.0, 45.0, 0.1) # default stats for LADY BLACKMARK (tire_friction, supension_compression, suspension_damping, suspension_stiffness, roll_influence)

        def activateEntities(self): # a single command that can be used to activate all inactive instances currently established during runtime; supports flagging of instances to not be activated

            for entity in self.instances: # check the list of all instances; each object within this list is referred to as an entity

                if entity.active == False and entity.flag_inactive == False: # check if the current instance/entity is active and if not, check if the entity is flagged to remain inactive

                    entity.active = True # activate the entity
                    self.active_instances.append(entity) # add the entity to the list of active instances

        def fetchEntity(self, entity_type, entity_id): # define the method fetchEntity, which locates a requested entity by type and id

            if entity_type == "character": # if the requested entity is of the character type

                if entity_id in self.active_character_ids: # if the requested entity's id is in the engine's list of active character ids

                    for entity in self.instances: # iterate over the list of instances

                        if entity.id == entity_id and isinstance(entity, g7Engine.g7Elements.gameCharacter): # if the id and entity type match

                            return entity # return the value of the entity
                        
            if entity_type == "camera":

                if entity_id in self.active_camera_ids:

                    for entity in self.instances:

                        if entity.id == entity_id and isinstance(entity, g7Engine.g7Elements.gameCamera):

                            return entity
                        
            if entity_type == "vehicle":

                if entity_id in self.active_vehicle_ids:

                    for entity in self.instances:

                        if entity.id == entity_id and isinstance(entity, g7Engine.g7Elements.gameVehicle):

                            return entity
                        
        def peruseNearbyEntities(self, entity, near_range=10.0, ignore_self=True, filter=None):

            nearby_list = [] # set an empty list to poulate with all nearby entities in range
            count = 0 # set a count variable to detect when the object count maximum has been reached
            
            if filter == "vehicle":

                for item in self.active_vehicles:

                    if count <= len(self.active_vehicles):

                        count += 1

                        if item.object and entity.object:

                            if item.object.getDistanceTo(entity.object) <= near_range:

                                distance = item.object.getDistanceTo(entity.object)

                                if ignore_self and item != entity:

                                    nearby_list.append((item, distance))

                                if not ignore_self:

                                    nearby_list.append((item, distance))

                        nearby_list.sort(key=lambda x: x[1])

                    if count >= len(self.active_vehicles) and nearby_list:

                        return nearby_list, nearby_list[0][0]
            
            if not filter:
            
                for item in self.instances:

                    if count <= len(self.instances):

                        count += 1

                        if item.object and entity.object:

                            if item.object.getDistanceTo(entity.object) <= near_range:

                                distance = item.object.getDistanceTo(entity.object)

                                if ignore_self and item != entity:
                                
                                    nearby_list.append((item, distance))

                                if not ignore_self:

                                    nearby_list.append((item, distance))

                        nearby_list.sort(key=lambda x: x[1])

                    if count >= len(self.instances) and nearby_list:

                        return nearby_list, nearby_list[0][0]
                    
        def peruseNearbyObjects(self, entity, near_range=10.0, ignore_self=True, filter=None, list=bge.logic.getCurrentScene().objects):

            nearby_list = []
            count = 0
            target_list = list

            # if not list:

            #     target_list = shell_scene.objects

            # elif list:

            #     target_list = list

            if target_list:

                print(target_list)
            
                if not filter:
                
                    for item in target_list:

                        if count <= len(target_list):

                            count += 1

                            if item.getDistanceTo(entity.object) <= near_range:

                                distance = item.getDistanceTo(entity.object)

                                if ignore_self and item != entity.object:
                                
                                    nearby_list.append((item, distance))

                                if not ignore_self:

                                    nearby_list.append((item, distance))

                        nearby_list.sort(key=lambda x: x[1])

                    if count >= len(target_list) and nearby_list:

                        # print(nearby_list[0][0].name)
                        return nearby_list, nearby_list[0][0]
                    
        def entityInFrame(self, entity):

            if entity:

                if entity.object:

                    if shell_scene.active_camera.pointInsideFrustum(entity.object.worldPosition):

                        return False
                    
                    else:

                        return True
                    
        def objectInFrame(self, object):

            if object:

                if shell_scene.active_camera.pointInsideFrustum(object.worldPosition):

                    return False
                
                else:

                    return True
                    
        def spawnVehicle(self, elements_object, name="", id=0, linked_object=None, physics_object=None, wheels=[]):

            if elements_object:

                pass

        class gameCamera: # class wrapper for a game camera with support for first person, third person and top down perspectives

            def __init__(self, elements_object, name="", id=0, linked_object=None, pivot_object=None, target_object=None, type=0): # initialize the gameCamera class

                self.framework_parent = elements_object # assign the parent elements object; used to allow the entity to be activated
                self.name = name # assign the camera name
                self.id = id # assign the camera id
                self.object = linked_object # assign the game object to be linked to this class instance
                self.pivot = pivot_object # assign the game object that will be used as the camera pivot point
                self.target = target_object # assign the game object that the game camera will follow
                self.type = type # assign the type of perspective this game camera will use
                self.active = False # assign the active value of this game camera instance
                self.flag_inactive = False # assign the flagging value of this game camera instance to let the engine know whether to instantiate it as an accessible item during runtime

                # below variables INHERITABLE by gameCameraPivot via "inheritCameraProperties" method

                self.pivot_sensitivity = 1.0
                self.pivot_threshold = 0.01
                self.pivot_set = False
                self.invert_x = 1.0
                self.invert_y = 1.0
                self.pivot_acceleration = 1.0
                self.track_target = None
                self.error = False
                self.error_code = 0

                if isinstance(linked_object, str): # if the linked object referenced by the camera is a string

                    if linked_object in shell_scene.objects: # check if the object is in the current scene, or has been loaded into the current scene
                    
                        self.object = shell_scene.objects[linked_object] # assign the object to the camera

                    # print(shell_scene.objects)

                elif isinstance(linked_object, bge.types.KX_GameObject): # if the linked object referenced by the camera is a blender game object

                    self.object = linked_object # assign the object to the camera

            def setPivot(self, pivot_object=None): # define the method setPivot, which assigns a pivot object to the camera

                if pivot_object == None and self.pivot_set == False: # if the pivot object parameter has None value and a pivot has not been set for the camera

                    pivot_object = self.pivot # set the pivot object parameter to be the current pivot registered with the camera
                    print("No pivot specified, pivot set to defaults.")
                    self.pivot = script_runner['engine_elements'].gameCameraPivot(shell_scene.objects[pivot_object])
                    self.pivot_set = True # denote that pivot has been set
                
                if isinstance(pivot_object, str): # if the pivot object parameter is a string
                    
                    if pivot_object in shell_scene.objects: # check if the pivot object is in the current scene or has been loaded into the current scene

                        if isinstance(framework_elements, g7Engine.g7Elements):

                            self.pivot = framework_elements.gameCameraPivot(shell_scene.objects[pivot_object])
                            print("Set pivot")

            def updateState(self):

                if isinstance(self.pivot.camera_reset, bge.types.KX_GameObject): # if the camera reset variable of the pivot is a blender game object

                    if isinstance(self.object, bge.types.KX_GameObject): # if this class instance's linked object is a blender game object

                        camera_collision_rear = self.object.rayCast(self.pivot.camera_reset, self.object, self.object.getDistanceTo(self.pivot.camera_reset), "camera_collision", 1, 1, 2) # cast a ray behind the camera to detect objects behind it
                        camera_collision_front = self.object.rayCast(self.pivot.camera_reset, self.pivot.object, self.pivot.camera_reset.getDistanceTo(self.pivot.object), "camera_collision", 1, 1, 2) # cast a ray ahead of the camera to detect objects in front of it

                        # print(camera_collision_front[1])

                        if camera_collision_front[1]: # if a collision is detected on the ray

                            collision_point = camera_collision_front[1] # cache the poit of collision as a variable
                            self.object.worldPosition = collision_point # set the camera object position to the collision point
                            # self.object.localPosition.y = collision_point[1] - 0.01

                        elif not camera_collision_front[1]: # if a collision is not detected on the ray

                            self.object.worldPosition = self.pivot.camera_reset.worldPosition # set the camera position to its resting position

                    elif isinstance(self.object, str):

                        if self.object in shell_scene.objects:
                    
                            self.object = shell_scene.objects[self.object]

                if self.id not in self.framework_parent.active_camera_ids:
                    
                    self.framework_parent.active_camera_ids.append(self.id)
                    self.framework_parent.instances.append(self) # add this game camera to the engine instances list

                if self.id in self.framework_parent.active_camera_ids:

                    # print("Id conflict has been found.")
                    self.error = True
                    self.error_code = 1

            def rotateCamera(self, axis=0, speed=1.0, local=True):

                camera = self.object
                pivot = self.pivot

                if local == True:

                    if axis == 0:

                        camera.setAngularVelocity()

            def mouseLook(self):

                control_system = script_runner['control_system']

        class gameCameraPivot: # class wrapper for a game camera pivot, with full controller support by way of the control system

            def __init__(self, linked_object):

                self.camera = None # assign the camera to which the pivot will be connected to
                self.object = linked_object # assign the object to which the pivot will be physically displayed
                self.free_mode = False # assign whether free mode is activated by default or not
                self.free_speed = 100.0 # assign the movement speed of the pivot during free mode
                self.pivot_sensitivity = 1.0 # assign the look speed of the pivot during free mode
                self.pivot_threshold = 0.01 # assign the threshold below which, the camera will not respond to input (deprecated: USE controlSystem > axisThreshold instead)
                self.invert_x = 1.0 # assign whether the camera pivot x axis is inverted or not
                self.invert_y = 1.0 # assign whether the camera pivot y axis is inverted or not
                self.pivot_acceleration = 1.0
                self.controller_acceleration = 0.2 # assign the amount of acceleration transferred to the pivot from the controller sticks
                self.track_target = None
                self.camera_x_limits = 85 # assign the rotation limit cap the the pivot cannot exceed in degrees
                self.pivot_rotation = 0.0 # assign the current rotation of the pivot in degrees
                self.projected_rotation = 0.0 # assign the rotation that the pivot is projected to have based on current inputs
                self.migrating = False
                self.migrate_distance_set = False
                self.migrate_distance = 0.0
                self.migrate_speed = 5
                self.calibrated = False
                self.current_target = None
                self.camera_tracker = None
                self.up_tracker = None

                self.last_track_time = 0.0
                self.cached_time = False
                self.tracking_pause_threshold = 0.8

                self.forward_key = bge.events.WHEELUPMOUSE
                self.backwards_key = bge.events.WHEELDOWNMOUSE
                self.up_key = bge.events.LEFTMOUSE
                self.down_key = bge.events.RIGHTMOUSE
                
                if self.object['camera_reset'] in shell_scene.objects:
                
                    self.camera_reset = shell_scene.objects[self.object['camera_reset']] # assign object to be used as a reference location for the camera to return to during camera collision
                    self.camera_reset.setParent(self.object)
                    # print("Camera position reset set.")

            def chainToTarget(self, target_object):

                # print("Establishing chain target...")

                if isinstance(target_object, str):

                    # self.current_target = self.track_target
                    self.track_target = shell_scene.objects[target_object]
            
            def inheritCameraProperties(self):

                if self.camera: # if the pivot has a camera object registered to it

                    self.pivot_sensitivity = self.camera.pivot_sensitivity # pivot intensity mirrors camera intensity
                    self.pivot_threshold = self.camera.pivot_threshold # pivot threshold mirrors camera threshold
                    self.invert_x = self.camera.invert_x
                    self.invert_y = self.camera.invert_y
                    self.pivot_acceleration = self.camera.pivot_acceleration
                    self.track_target = self.camera.track_target
            
            def runFreeMode(self):

                self.free_mode = True # turn free mode on
                self.free_speed = 10.0 # set the movement speed for the camera during free mode

            def freeMovement(self): # define the method freeMovement, which allows the player to control the camera as if they are flying with no attachment to any target object

                self.pivot_rotation = math.degrees(self.object.localOrientation.to_euler().x) # get the current x rotation value of the camera pivot in degrees
                self.y_rot = math.degrees(self.object.localOrientation.to_euler().y)

                if self.y_rot != 0:

                    self.object.localOrientation = mathutils.Euler((self.object.localOrientation.to_euler().x, math.radians(0), self.object.localOrientation.to_euler().z), "XYZ")

                # print(math.degrees(self.object.localOrientation.to_euler().x))

                def freeLook(self): # define the method freeLook, which allows the pivot to be freely controlled by an input device

                    if self.pivot_rotation > self.camera_x_limits: # if the current rotation of the pivot is greater than the rotation limit

                        self.object.localOrientation = mathutils.Euler((math.radians(self.camera_x_limits-0.01), self.object.localOrientation.to_euler().y, self.object.localOrientation.to_euler().z), 'XYZ') # set the pivot rotation to be slightly less than the rotation limit to prevent locking

                    if self.pivot_rotation < -self.camera_x_limits: # if the current rotation of the pivot is less than the negative inverse of the rotation limit

                        self.object.localOrientation = mathutils.Euler((math.radians(-self.camera_x_limits+0.01), self.object.localOrientation.to_euler().y, self.object.localOrientation.to_euler().z), 'XYZ') # set the pivot rotation to be slightly more than the negative inverse of the rotation limit to prevent locking

                    if self.pivot_rotation + self.projected_rotation > self.camera_x_limits: # if the projected rotation of the pivot falls outside of the rotation limit

                        self.object.localOrientation = mathutils.Euler((math.radians(self.camera_x_limits-0.01), self.object.localOrientation.to_euler().y, self.object.localOrientation.to_euler().z), 'XYZ') # set the pivot rotation to be slightly less than the rotation limit to prevent locking

                    if self.pivot_rotation + self.projected_rotation < -self.camera_x_limits: # if the projected rotation of the pivot falls outside of the negative inverse of the rotation limit

                        self.object.localOrientation = mathutils.Euler((math.radians(-self.camera_x_limits+0.01), self.object.localOrientation.to_euler().y, self.object.localOrientation.to_euler().z), 'XYZ') # set the pivot rotation to be slightly more than the negative inverse of the rotation limit to prevent locking

                    control_system = script_runner['control_system'] # assign value to the control system
                    
                    mouse_sensor = self.object.sensors['MouseMove'] # get the pivot object's mouse movement sensor (mouse movement detection doesn't work as well with a purely python approach)

                    if isinstance(control_system, g7Engine.g7Systems.controlSystem): # if the control system is an instance of the g7Engine controlSystem

                        if control_system.keymap.camera_rotate_stick in control_system.activeGamepadInputs: # check if the gamepad stick linked to camera rotation is active

                            self.pivot_sensitivity = 0.2

                            if -self.camera_x_limits < self.pivot_rotation < self.camera_x_limits: # check if the current rotation of the pivot is within the rotation limit

                                if control_system.keymap.camera_rotate_stick == control_system.gamepadRStick: # if the stick in question is the right stick

                                    self.projected_rotation = math.degrees(-control_system.gamepadRStickValue[1]*self.invert_x*self.pivot_sensitivity*self.controller_acceleration) # calculate the projection rotation that the pivot will add, based on the degree to which the right stick is pushed
                                    # print(self.projected_rotation)

                                    if 0 < self.pivot_rotation + self.projected_rotation < self.camera_x_limits or 0 > self.pivot_rotation + self.projected_rotation > -self.camera_x_limits: # if the sum of the current rotation of the pivot and the projected rotation fall within the rotation limit

                                        self.object.applyRotation((-control_system.gamepadRStickValue[1]*self.invert_y*self.pivot_sensitivity*self.controller_acceleration, 0, 0), True) # apply the rotation to the pivot

                                    self.object.applyRotation((0, 0, -control_system.gamepadRStickValue[0]*self.invert_x*self.pivot_sensitivity*self.controller_acceleration), False) # apply rotation to the pivot

                                if control_system.keymap.camera_rotate_stick == control_system.gamepadLStick:

                                    self.projected_rotation = control_system.gamepadLStickValue[0]*self.invert_x*self.pivot_sensitivity*self.controller_acceleration

                                    self.object.applyRotation((0, 0, control_system.gamepadLStickValue[0]*self.invert_x*self.pivot_sensitivity*self.controller_acceleration), False)
                                    self.object.applyRotation((control_system.gamepadLStickValue[1]*self.invert_y*self.pivot_sensitivity*self.controller_acceleration, 0, 0), True)

                        else:

                            self.pivot_sensitivity = 1.0

                        # if control_system.keymap.camera_linear_stick in control_system.activeGamepadInputs:

                        #     self.object.setLinearVelocity((0, -1.0*control_system.gamepadLStickValue[1]*self.free_speed, 0), True)
                    
                    if self.camera: # if camera exists
                     
                        if self.camera.object in self.object.children: # if the camera object is a child of the pivot
                        
                            mouse = bge.logic.mouse # get the current mouse device and cache inside variable

                            mouse_x = mouse.position[0] # cache mouse cursor x position in variable
                            mouse_y = mouse.position[1] # cache mouse cursor y position in variable

                            mouse.position = (0.5, 0.5) # set mouse position to center of screen

                            normalized_x = mouse_x - 0.5 # normalize the mouse left/right position to prepare it for the applyRotation method(prevents the camera from rotating when the mouse is not moving)
                            normalized_y = mouse_y - 0.5 # normalize the mouse up/down position to prepare it for the applyRotation method(prevents the camera from rotating when the mouse is not moving)
                                
                            sensitivity = self.pivot_sensitivity # get camera mouse look sensitivity value
                            invert_x = self.invert_x # check if x axis is inverted
                            invert_y = self.invert_y # check if y axis is inverted
                            threshold = self.pivot_threshold # get camera mouse look threshold value (this ensure a deadzone for mouse look even if the normalized mouse values aren't precisely 0)
                            # the threshold should preferably be a small value to ensure smooth camera movement
                                
                            if 0.5 + threshold < mouse_x or mouse_x < 0.5 - threshold: # if mouse movement is outside the threshold bounds
                            
                                self.object.applyRotation((0,0,normalized_x*-invert_x*sensitivity), False) # rotate camera left/right at the indicated value gotten from mouse movement
                                # pass
                                
                            if 0.5 + threshold < mouse_y or mouse_y < 0.5 - threshold: # if mouse movement is outside the threshold bounds
                                
                                self.object.applyRotation((normalized_y*-invert_y*sensitivity,0,0), True) # rotate camera up/down at the indicated value gotten from mouse movement
                                # pass

                freeLook(self) # run the freeLook module

                def freeForward(self):

                    self.object.setLinearVelocity((0, self.free_speed*1.0, 0), True)

                def freeBackward(self):

                    self.object.setLinearVelocity((0, self.free_speed*-1.0, 0), True)

                def freeUpward(self):

                    self.object.setLinearVelocity((0, 0, self.free_speed*1.0), False)

                def freeDownward(self):

                    self.object.setLinearVelocity((0, 0, self.free_speed*-1.0), False)

            def lookAtObject(self, object):

                if object:

                    if object in shell_scene.objects:

                        vector_to_object = self.object.getVectTo(object)
                        self.object.alignAxisToVect(vector_to_object[1], 1, 0.8)
                        self.object.alignAxisToVect((0, 0, 1.0), 2, 0.5)

            def migrateToTarget(self, target):

                hook_threshold = 0.5
                distance_to_target = self.object.getDistanceTo(target)
                increment = distance_to_target/self.migrate_speed

                    
                if self.camera and self.current_target != self.track_target:

                    if self.migrate_distance_set == False and self.object.worldPosition != target.worldPosition and distance_to_target > hook_threshold:

                        distance_to_target = self.object.getDistanceTo(target)
                        self.migrate_distance = distance_to_target
                        self.migrate_distance_set = True

                    if not self.migrating and self.object.worldPosition != target.worldPosition and self.current_target != self.track_target:

                        self.migrating = True
                        # print("Starting migration...")

                    if self.migrating and self.migrate_distance_set:

                        vector_to_target = self.object.getVectTo(target)
                        self.object.setLinearVelocity((vector_to_target[1]*distance_to_target)*(self.migrate_speed*6.0), False)
                        # self.lookAtObject(target)
                        # increment = self.migrate_distance/self.migrate_speed
                        # self.object.applyMovement((0, increment, 0), True)
                        print(self.migrate_distance, increment)
                        # print("Migrate")

                        if distance_to_target < hook_threshold:

                            self.object.worldPosition = target.worldPosition
                            self.migrating = False
                            self.migrate_distance = 0.0
                            self.migrate_distance_set = False
                            self.current_target = self.track_target
                            # print("Migration complete.")

            def trackToCameraTarget(self, inverse=1.0):

                if self.cached_time:

                    current_time = bge.logic.getFrameTime()

                    if current_time - self.last_track_time > self.tracking_pause_threshold:

                        if self.camera_tracker:

                            vector_to_tracker = self.object.getVectTo(self.camera_tracker)
                            modified_vector = (vector_to_tracker[1][0]*inverse, vector_to_tracker[1][1]*inverse, vector_to_tracker[1][2])
                            self.object.alignAxisToVect(modified_vector, 1, 0.09)
                            self.object.alignAxisToVect((0,0, 0.1), 2, 0.2)

                            # if inverse == 1.0:

                            #     self.object.alignAxisToVect((0,0, 0.1), 2, 0.2)

                            # elif inverse == -1.0:

                            #     self.object.alignAxisToVect((0,0, 0.1), 2, 0.8)

                # if self.up_tracker:

                #     up_vector = self.object.getVectTo(self.up_tracker)
                #     self.object.alignAxisToVect(up_vector[1], 2, 0.4)
                    
            def pauseTracking(self):

                self.cached_time = False
                # print("Pausing tracking...")

            def setTrackingTimer(self):

                if not self.cached_time:

                    self.last_track_time = bge.logic.getFrameTime()
                    self.cached_time = True
                    # print("Set pause time...")

            def updateState(self):

                # print("Updating...")

                if self.track_target:

                    if self.object.worldPosition != self.track_target.worldPosition:

                        if self.calibrated:
                            
                            if self.current_target != self.track_target:

                                self.migrateToTarget(self.track_target)

                            elif self.current_target == self.track_target:

                                self.object.worldPosition = self.track_target.worldPosition

                        if not self.calibrated:

                            self.object.worldPosition = self.track_target.worldPosition
                            self.current_target = self.track_target
                            self.calibrated = True

                    # if self.object.worldPosition == self.track_target.worldPosition:

                    #     self.object.worldPosition = self.track_target.worldPosition

                    for child in self.track_target.children:

                        if "up_track" in child:

                            self.up_tracker = child
                            break

                        else:

                            self.up_tracker = None

                    for child in self.track_target.children:

                        if "camera_track" in child:

                            self.camera_tracker = child
                            break

                        else:

                            self.camera_tracker = None


        class gameCharacter: # class wrapper for a game character, designed for all kinds of characters including non human ones

            def __init__(self, elements_object, name="", id=0, linked_object=None, physics_object=None, awareness_controller=None): # initialize the gameCharacter class

                # MAIN IDENTIFIER PROPERTIES such as name, id and linked objects
                
                self.framework_parent = elements_object # assign the parent elements object; used to allow the entity to be activated
                self.name = name # assign the character name
                self.id = id # assign the character id
                self.object = linked_object # assign the game object to be linked to this class instance
                self.physics_controller = physics_object # assign the game object that this character instance will use to handle physics interactions
                self.awareness_controller = awareness_controller # assign the game object that this character instance will use to handle their spatial awareness
                self.active = False # assign the active value of this game character instance
                self.flag_inactive = False # assign the flagging value of this game character instance to let the engine know whether to instantiate it as an accessible item during runtime
                self.player = False # assign whether this character is controlled actively by the player
                self.forward_axis = 1 # assign the forwards moving axis of the character
                self.memory_object = None
                self.instanced = False

                # AWARENESS PROPERTIES for use with the awareness controller

                self.awareness_diagonal = None

                self.requesting_entrance = False
                self.requesting_exit = False

                self.parkour_probe = None
                self.parkour_probe_helper = None

                self.interact_target = None

                self.is_driver = False
                self.is_passenger = False

                self.error = False
                self.error_code = 0

                # MOVEMENT PROPERTIES for use with the physics controller

                self.flying = False # assign whether the character is flying
                self.idle = False # assign whether the character is in an idle state (performing no actions and receiving no inputs)
                self.jogging = False # assign whether the character is moving at jogging speed
                self.jumping = False # assign whether the character is jumping
                self.physics_paused = False # assign whether the character physics are paused or not
                self.ragdoll_active = False # assign whether the character ragdoll is active or not
                self.sprinting = False # assign whether the character is moving at sprinting speed
                self.walking = False # assign whether the character is moving at walking speed
                self.targeting = False # assign whether the character is targeting an object
                self.looking_target = None
                self.parkour_seek_range = 0.0
                self.seek_banner = 0.5
                self.target_parkour_point = None
                self.current_parkour_point = None
                self.parkour_point_reached = False
                self.run_parkour = False
                self.minimum_parkour_range = 0.0
                self.maximum_parkour_range = 0.0
                self.applied_descent_jump = False
                self.jump_reset = True
                self.on_ground = False
                self.local_parkour_map = None
                self.parkour_leap_speed = 8.0
                self.tracking_sensitivity = 0.5
                self.map_analysis = None

                self.x_speed_input = 0.0
                self.y_speed_input = 0.0
                self.z_speed_input = 0.0

                self.moving = False

                # STAT PROPERTIES for use with the game

                health = 0

                if self.id not in self.framework_parent.active_character_ids:
                    
                    self.framework_parent.active_character_ids.append(self.id)
                    self.framework_parent.instances.append(self) # add this game camera to the engine instances list
                    self.framework_parent.active_characters.append(self)
                    self.instanced = True
                    self.memory_object = self.getMemoryObject()

                if self.id in self.framework_parent.active_character_ids:

                    print("Id conflict has been found.")
                    self.error = True
                    self.error_code = 1

                    if self.instanced == False:

                        conflicting_entity = self.framework_parent.fetchEntity("character", self.id)
                        print(f'%(myname)s has not been instanced due to an id conflict with %(conflict_name)s. Please resolve this issue in order to successfully instance this character.' % { "myname" : self.name, "conflict_name" : conflicting_entity.name })


            def flagInactive(self): # define the method flagNoActivate which sets the character to not be activated as a usable item during game runtime

                self.flag_noactivate = True # sets the flag state of noactivate to True

            def flagActive(self): # define the method flagActivate which sets the character to be activated as a usable item during game runtime

                self.flag_inactive = False # sets the flag state of noactivate to False

            def getMemoryObject(self):

                if self.id in self.framework_parent.active_character_ids:

                    memory_object_placement = self.framework_parent.instances.index(self)
                    memory_object = self.framework_parent.instances[memory_object_placement]

                    return memory_object

            def setForwardAxis(self, axis):

                self.forward_axis = axis
                
                return None

            def setMovement(self, velocity, axis):

                self.moving = True

                if self.physics_controller:

                    current_velocity = self.physics_controller.getLinearVelocity(True)
                    xv = current_velocity.x*0.85
                    yv = current_velocity.y*0.85
                    zv = current_velocity.z*0.1

                    weight_influence = 0.85

                    # print(current_velocity)

                    if current_velocity.y > 10:

                        self.physics_controller.applyForce((current_velocity.x*1000, 0, 0,), True)
                
                    if axis == 0:

                        self.x_speed_input = velocity

                        self.physics_controller.setLinearVelocity((velocity, yv, zv), True)

                    elif axis == 1:

                        self.y_speed_input = velocity

                        self.physics_controller.setLinearVelocity((xv, velocity, zv), True)

                    elif axis == 2:

                        self.z_speed_input = velocity

                        self.physics_controller.setLinearVelocity((xv, yv, velocity), True)

                    # self.physics_controller.setLinearVelocity((self.x_speed_input, self.y_speed_input, self.z_speed_input), True)

                return None
            
            def setRotation(self, velocity, axis):

                if self.physics_controller:

                    if axis == 0:

                        self.physics_controller.setAngularVelocity((velocity, 0, 0), True)

                    elif axis == 1:

                        self.physics_controller.setAngularVelocity((0, velocity, 0), True)

                    elif axis == 2:

                        self.physics_controller.setAngularVelocity((0, 0, velocity), True)

            def solveCameraTracking(self):

                camera = shell_scene.active_camera
                camera_location = camera.worldPosition

                pass

            def engageAwareness(self):

                pass

            def followTarget(self, target=None, deadzone=25.0, follow_speed=-20):

                if target:

                    if self.object.getDistanceTo(target) > deadzone:

                        target_vector = self.object.getVectTo(target)
                        self.object.alignAxisToVect(-target_vector[1], 1, 0.4)
                        self.object.alignAxisToVect((0, 0, 1), 2, 1.0)
                        self.setMovement(follow_speed, 1)

            def lookAtTarget(self, target=None):

                if target:

                    target_vector = self.object.getVectTo(target)
                    self.object.alignAxisToVect(-target_vector[1], 1, 0.4)
                    self.object.alignAxisToVect((0, 0, 1), 2, 1.0)

            def fleeTarget(self, target=None, safety_threshold=15.0):

                if target:

                    if self.object.getDistanceTo(target) < safety_threshold:

                        target_vector = self.object.getVectTo(target)
                        self.object.alignAxisToVect(target_vector[1], 1, 0.4)
                        self.object.alignAxisToVect((0, 0, 1), 2, 1.0)
                        self.setMovement(-30.0, 1)

        class gameVehicle: # class wrapper for a game vehicle

            def __init__(self, elements_object, name="", id=0, linked_object=None, physics_object=None, wheels=[], assembly_template=(4.0, 10.0, 2.0, 60.0, 0.14)): # initialize the gameVehicle class

                self.framework_parent = elements_object # assign the parent elements object; used to allow the entity to be activated
                self.name = name # assign the vehicle name
                self.id = id # assign the vehicle id
                self.object = linked_object # assign the game object to be linked to this class instance
                self.physics_controller = physics_object # assign the game object that this vehicle instance will use to handle physics interactions
                self.wheels = wheels # assign the wheels (if applicable) to be attached to the vehicle in the form of a list of gameObjects
                self.active = False # assign the active value of this game vehicle instance
                self.flag_inactive = False # assign the flagging value of this game vehicle instance to let the engine know whether to instantiate it as a usable item
                self.assembled = False # assign the assembled value of this game vehicle instance, which denotes whether wheels have been attached
                self.assemble_index = 0
                self.active_wheels = 0

                self.pause_distance = 0.4
                self.paused = False

                self.has_driver = False
                self.enter_range = 8.0

                self.physID = self.object.getPhysicsId()
                self.constraint = bge.constraints.createVehicle(self.physID)
                self.constID = self.constraint.getConstraintId()
                self.autoID = bge.constraints.getVehicleConstraint(self.constID)

                self.REAR_WHEEL_DRIVE = 0
                self.FRONT_WHEEL_DRIVE = 1
                self.ALL_WHEEL_DRIVE = 2
                self.ENGINE_THRUST = 3

                self.max_engine_horsepower = 8000.0
                self.max_handbrake_power = 15000.0
                self.tire_friction = 10.0
                self.max_steering = 0.8
                self.steering_goal = 0.0
                self.steering_increment = 0.02
                self.realign_steering_increment = 0.04
                self.current_steering = 0.0
                self.steer_threshold = 0.06

                self.wheel_count = len(self.wheels)
                self.steering_wheels = []
                self.engine_wheels = []
                self.rear_wheels = []
                self.rear_steering_wheels = []
                self.attach_index = -1

                self.speed_save_time = 0.0
                self.saved_rotations = 0.0
                self.rotations = 0.0
                self.mph = 0.0

                self.is_using_car_physics = False
                self.initialized_driving = False

                # self.framework_parent.instances.append(self) # add this game vehicle to the engine instances list

                if self.id not in self.framework_parent.active_vehicle_ids:
                    
                    self.framework_parent.active_vehicle_ids.append(self.id)
                    self.framework_parent.instances.append(self) # add this game camera to the engine instances list
                    self.framework_parent.active_vehicles.append(self)

                if self.id in self.framework_parent.active_vehicle_ids:

                    print("Id conflict has been found.", name)
                    self.error = True
                    self.error_code = 1

                self.assembleVehicle(assembly_template)

            def assembleVehicle(self, assembly_template=(100.0, 10.0, 2.0, 60.0, 0.04)):

                # self.is_using_car_physics = True
                # assemble_index = self.assemble_index

                # for wheel in self.wheels:

                #     if self.assemble_index < self.wheel_count:

                #         print(self.assemble_index)

                #         if wheel in shell_scene.objects: #and self.assemble_index + 1 == self.wheel_count:

                #             self.autoID.addWheel(shell_scene.objects[wheel], (0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0), 0.4, 1.6, False)
                #             self.autoID.setTyreFriction(5.0, assemble_index)
                #             self.autoID.setSuspensionCompression(10.0, assemble_index)
                #             self.autoID.setSuspensionDamping(2.0, assemble_index)
                #             self.autoID.setSuspensionStiffness(60.0, assemble_index)

                #             self.assemble_index += 1
                #             self.active_wheels += 1

                #             print(wheel)

                print(self.object.blenderObject.dimensions)

                self.is_using_car_physics = True

                for wheel in self.wheels:

                    wheel_object = shell_scene.objects[wheel]
                    index = self.wheels.index(wheel)
                    wheel_dimensions = wheel_object.blenderObject.dimensions
                    wheel_diameter = wheel_dimensions[2]
                    wheel_radius = abs(wheel_diameter*0.5)
                    # print(wheel_dimensions, wheel_radius)
                    
                    if not wheel_object['attached']:

                        print(f'Wheel object {wheel_object.name} is not attached...')
                    
                        for child in self.object.children:
                        
                            if 'linked' in child:

                                if not child['linked']:

                                    self.attach_index += 1
                                    relative_position = child.worldPosition - self.object.worldPosition
                                    steering_enabled = child['steering']
                                    engine_enabled = child['engine']
                                    rear_wheel = child['rear']
                                    # print(steering_enabled)
                                    self.autoID.addWheel(wheel_object, relative_position, (0.0, 0.0, -1.0), (-1.0, 0.0, 0.0), 0.1, wheel_radius, steering_enabled)
                                    self.autoID.setTyreFriction(assembly_template[0], index)
                                    self.autoID.setSuspensionCompression(assembly_template[1], index)
                                    self.autoID.setSuspensionDamping(assembly_template[2], index)
                                    self.autoID.setSuspensionStiffness(assembly_template[3], index)
                                    self.autoID.setRollInfluence(assembly_template[4], index)
                                    wheel_object['attached'] = True
                                    child['linked'] = True
                                    
                                    if steering_enabled:

                                        self.steering_wheels.append(index)

                                        if child['rear']:

                                            self.rear_steering_wheels.append(index)

                                    if engine_enabled:

                                        self.engine_wheels.append(index)

                                    if rear_wheel:

                                        self.rear_wheels.append(index)

                                    break
                
                # self.autoID.addWheel(shell_scene.objects[self.wheels[0]], (0.0, 0.0, 0.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0), -4.4, 1.6, False)
            
            def accelerateVehicle(self, modifier=1.0):

                if self.is_using_car_physics == True:

                    for x in self.engine_wheels:

                        self.autoID.applyEngineForce(self.max_engine_horsepower*modifier, x)

            def brakeVehicle(self, modifier=1.0):

                if self.is_using_car_physics == True:

                    for x in self.engine_wheels:

                        self.autoID.applyEngineForce(0.0, x)

                    for x in self.rear_wheels:

                        self.autoID.applyBraking(self.max_handbrake_power*modifier, x)


            def reverseVehicle(self, modifier=1.0):

                if self.is_using_car_physics:

                    for x in self.engine_wheels:

                        self.autoID.applyEngineForce(-self.max_engine_horsepower*modifier, x)

            def steerVehicle(self, modifier=0.6):

                # turn_increment = modifier*self.steering_increment
                normalized_modifier = abs(modifier)
                finetune_modifier = normalized_modifier*normalized_modifier
                self.steering_goal = self.max_steering*(modifier*finetune_modifier)
                # print(turn_increment)
                
                if self.is_using_car_physics:

                    for x in self.steering_wheels:

                        if x not in self.rear_steering_wheels:

                            if self.current_steering < self.steering_goal:

                                self.current_steering += (self.steering_increment*1.0)*finetune_modifier

                            elif self.current_steering > self.steering_goal:

                                self.current_steering -= (self.steering_increment*1.0)*finetune_modifier

                            if self.current_steering < 0:# and self.current_steering+0.15 < 0:

                                self.autoID.setSteeringValue(self.current_steering, x)

                            elif self.current_steering > 0:# and self.current_steering-0.15 > 0:

                                self.autoID.setSteeringValue(self.current_steering, x)

                        if x in self.rear_steering_wheels:

                            if self.current_steering < -self.steering_goal:

                                self.current_steering += (self.steering_increment*1.0)

                            elif self.current_steering > -self.steering_goal:

                                self.current_steering -= (self.steering_increment*1.0)

                            if self.current_steering < 0:# and self.current_steering+0.15 < 0:

                                self.autoID.setSteeringValue(self.current_steering, x)

                            elif self.current_steering > 0:# and self.current_steering-0.15 > 0:

                                self.autoID.setSteeringValue(self.current_steering, x)


                        
                        # self.autoID.setSteeringValue(self.current_steering, x)

            def realignSteering(self):

                # print(self.current_steering, "Steer")

                if self.current_steering != 0:

                    if -self.steer_threshold < self.current_steering < self.steer_threshold:

                        self.current_steering = 0.0

                    if self.current_steering < 0:

                        self.current_steering += self.realign_steering_increment
                        # self.autoID.setSteeringValue(self.current_steering, x)

                    elif self.current_steering > 0:

                        self.current_steering -= self.realign_steering_increment
                        # self.autoID.setSteeringValue(self.current_steering, x)

                for x in self.steering_wheels:
                    
                    self.autoID.setSteeringValue(self.current_steering, x)

            def idleVehicle(self, target):

                for x in range(len(self.wheels)):

                        if target == 0:
                        
                            self.autoID.applyEngineForce(0.0, x)

                        if target == 1:

                            # self.autoID.setSteeringValue(0.0, x)
                            pass

                        if target == 2:

                            self.autoID.applyBraking(0.0, x)

                        if target == 3:

                            self.autoID.applyBraking(self.max_handbrake_power*0.01, x)

            def probeForDrivers(self):

                for character in self.framework_parent.active_characters:

                    if not self.has_driver:

                        if character.object.getDistanceTo(self.object) <= self.enter_range:

                            character_target = self.framework_parent.peruseNearbyEntities(character, self.enter_range, True, "vehicle")

                            # if character_target:

                            #     print(character_target[1].name)

                            # print("Potential driver is nearby...")

                            if character.requesting_entrance and character_target and character_target[1] == self:

                                character.object.setParent(self.object, False, True)
                                character.is_driver = True
                                self.has_driver = True

                    if self.has_driver:

                        if character.object in self.object.children:

                            if character.requesting_exit:

                                character.object.removeParent()
                                character.is_driver = False
                                self.has_driver = False

            def calculateSpeed(self):

                if self.is_using_car_physics:
                
                    self.rotations = self.autoID.getWheelRotation(0)

                    threshold = 0.1
                    current_time = bge.logic.getFrameTime()
                    
                    if current_time - self.speed_save_time > threshold:

                        mph = -((self.rotations - self.saved_rotations)*5)
                        self.speed_save_time = current_time
                        self.saved_rotations = self.rotations
                        self.object['mph'] = mph
                        self.mph = mph

                        return mph


        class gameSpawnPoint:

            def __init__(self, linked_object=None):

                self.threshold_distance = 1000
                self.object = linked_object

    class g7Systems:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

            self.active_systems = []

        class debugSystem:

            def __init__(self):

                self.requests = []
                self.active = False
                self.command_dictionary = { 1: '', 2: 'All inactive entities activated.' , 3: "Library loaded successfully." }

        class animationSystem: # class wrapper for the animation system

            def __init__(self):

                pass
        
        class assetSystem: # class wrapper for the asset system

            def __init__(self): # initialize the assetSystem class

                # assetSystem BASE PROPERTIES

                self.active = False
                # self.parent_system = parent_system
                # self.parent_engine = parent_engine
                self.libraries = []
                self.linked_objects = []
                self.unload_distance_modifier = 1000
                self.shadow_activation_distance = 0.25
                self.contact_shadow_activation_distance = 0.1

                # assetSystem DYNAMIC OPS PROPS

                self.pending_operations = []

                # assetSystem DYNAMIC LISTS

                self.render_objects_active = []
                self.render_objects_inactive = []
                
                self.constant_spawn_points = [] # list of spawn points that stay persistent in the scene regardless of player proximity
                self.streamed_spawn_points = [] # list of spawn points that are streamed into the scene during gameplay based on player proximity
                self.spawn_points_unnacounted_within_proximity = [] # list of spawn points that are within proximity but have not been accounted for
                self.spawn_points_unnacounted_outside_proximity = [] # list of spawn points that are outside proximity but have not been accounted for
                self.spawns = [] # list of spawned objects within the scene
                self.spawns_remove_ready = []
                self.dynalamps = [] # list of dynamic light sources within the scene
                self.dynalamps_in_use = [] # list of dynamic light sources that are active within the scene
                self.dynalamps_idle = []
                self.lamps_in_range_shadow = []
                self.lamps_in_range_contact_shadow = []
                self.lamps_out_of_range_shadow = []
                self.lamps_out_of_range_contact_shadow = []
                self.lamps_that_have_scheduling = []
                self.parentless_active = []
                self.parentless_inactive = []

            def libraryExists(self, library_name): # a command that can be used to check if a library exists in memory or not

                library_list = bpy.data.libraries # create a list of all libraries in memory; is created as a collection data type which is not in a usable form by default

                if library_name in library_list:

                    library_exists = True # the library exists in memory

                elif library_name not in library_list: # if the requested library filepath does not exist in our temporary list, then the library has not been loaded

                    library_exists = False # the library does not exist in memory

                return library_exists # return the value boolean for if the library exists in memory or not
            
            def listLibraries(self): # define the method listLibraries, which will print and return a list of the libraries currently loaded into memory

                library_use_list = [] # create an empty list to be populated by the libraries used in memory

                library_list = bpy.data.libraries # get the list of libraries loaded in memory, cache in variable

                for library in library_list: # for each library in the library list

                    library_use_list.append(library) # add each library to the generated empty list

                print(bpy.data.libraries)
                return library_use_list

            def updateState(self): # define the method, updateState which keeps the system state updated as the game progresses

                self.populateWorld() # populate the world with the loaded assets in memory
                # self.manageShadows()
                self.manageScheduling()
            
            def loadLibrary(self, library_name, library_filepath, library_type, targeted_scene, targeted_collection):

                target_scene = targeted_scene
                target_collection = targeted_collection

                if self.libraryExists(library_name):

                    # print(f'The requested library {library_name} has already been loaded into memory. No further action necessary.')
                    pass

                elif not self.libraryExists(library_name):

                    script_runner['active_lib_stream_complete'] = False
                    script_runner['inactive_lib_stream_complete'] = False

                    converted_game_objects_active = []
                    converted_game_objects_inactive = []

                    if library_type == "object":

                        with bpy.data.libraries.load(library_filepath+library_name) as (library_data_streaming_from, library_data_streaming_to): # start the loading process

                            library_data_streaming_to.objects = library_data_streaming_from.objects # define the loading to and from process

                        imported_objects = library_data_streaming_to.objects
                        # print(imported_objects)
                        self.sortRenderObjects(imported_objects)

                        for blender_object in self.render_objects_active:

                            if blender_object.parent:

                                blender_object.parent = blender_object.parent

                            blender_object.hide_viewport = False

                            if blender_object.name not in target_collection.objects:

                                target_collection.objects.link(blender_object)
                                game_object = target_scene.convertBlenderObject(blender_object) # generate a game object from the blender object
                                converted_game_objects_active.append(game_object)
                                game_object['parent'] = blender_object.parent

                                self.sortObjectBasedOnProperties(game_object)

                        else:

                            for game_object in converted_game_objects_active:

                                if 'parent' in game_object and game_object['parent']:

                                    game_object.setParent(shell_scene.objects[game_object['parent'].name])

                            else:

                                script_runner['active_lib_stream_complete'] = True

                        for blender_object in self.render_objects_inactive:

                            if blender_object.parent:

                                blender_object.parent = blender_object.parent

                            blender_object.hide_viewport = True

                            if blender_object.name not in target_collection.objects:

                                target_collection.objects.link(blender_object)
                                game_object = target_scene.convertBlenderObject(blender_object) # generate a game object from the blender object
                                converted_game_objects_inactive.append(game_object)
                                game_object['parent'] = blender_object.parent

                                self.sortObjectBasedOnProperties(game_object)

                        else:

                            for game_object in converted_game_objects_inactive:

                                print(game_object)

                                if 'parent' in game_object and game_object['parent']:

                                    game_object.setParent(shell_scene.objectsInactive[game_object['parent'].name])

                            else:

                                script_runner['inactive_lib_stream_complete'] = True

            def unloadLibrary(self, library_name, collection):

                library_list = bpy.data.libraries
                target_collection = collection

                if self.libraryExists(library_name):

                    target_library = library_list[library_name]

                    def unlinkObjects():

                        for object in target_collection.objects:

                             collection.objects.unlink(object)

                    unlinkObjects()
                    bpy.data.libraries.remove(target_library)

                elif not self.libraryExists(library_name):
            
                    print('The requested library does not exist in memory.')

            def manageScheduling(self):

                for lamp in self.lamps_that_have_scheduling:

                        lamp_data = lamp['spawn_parent']['master_lamp'].blenderObject.data

                        if not lamp['spawn_parent']['backup_saved']:

                            lamp['spawn_parent']["energy_backup"] = lamp['spawn_parent']['value_energy']
                            lamp['spawn_parent']['backup_saved'] = True

                        elif lamp['spawn_parent']['backup_saved']:

                            if script_runner['lights_out']:

                                lamp['spawn_parent']['value_energy'] = 0.0

                            elif not script_runner['lights_out']:

                                lamp['spawn_parent']['value_energy'] = lamp['spawn_parent']['energy_backup']

                        if lamp_data.energy != lamp['spawn_parent']['value_energy']:

                            lamp_data.energy = lamp['spawn_parent']['value_energy']
                    
            def manageSpecialLights(self, lamp):

                lamp_data = shell_scene.objectsInactive[lamp.name].blenderObject.data

                if lamp_data.type == 'AREA':

                    lamp_data.size = lamp['spawn_parent']['size_x']
                    lamp_data.size_y = lamp['spawn_parent']['size_y']
                    lamp_data.shape = lamp['spawn_parent']['shape']

                    if 'cutoff_distance' in lamp['spawn_parent']:

                        lamp_data.cutoff_distance = lamp['spawn_parent']['cutoff_distance']

                    if 'shadow_clip_start' in lamp['spawn_parent']:

                        lamp_data.shadow_buffer_clip_start = lamp['spawn_parent']['shadow_clip_start']

                elif lamp_data.type == 'SPOT':

                    lamp_data.spot_size = lamp['spawn_parent']['spot_size']
            
            def manageShadows(self):

                for lamp in self.lamps_in_range_contact_shadow:

                    lamp_data = lamp['lamp_data']
                    lamp_data.use_contact_shadow = True
                    lamp['use_contact_shadow'] = True

                for lamp in self.lamps_out_of_range_contact_shadow:

                    lamp_data = lamp['lamp_data']
                    lamp_data.use_contact_shadow = False
                    lamp['use_contact_shadow'] = False

                for lamp in self.lamps_in_range_shadow:

                    lamp_data = lamp['lamp_data']
                    lamp_data.use_shadow = True
                    lamp['use_shadow'] = True

                for lamp in self.lamps_out_of_range_shadow:

                    lamp_data = lamp['lamp_data']
                    lamp_data.use_shadow = False
                    lamp['use_shadow'] = False

            def addObject(self, spawn_point):

                print("Adding...")

                target_scene = bge.logic.getCurrentScene()
                blender_system_active_object_list = target_scene.objects
                blender_system_inactive_object_list = target_scene.objectsInactive
                target_camera = target_scene.active_camera

                if spawn_point['type'] == 'light':

                    if self.dynalamps_idle:

                        target_lamp = self.dynalamps_idle[0]

                        spawned_lamp = target_scene.addObject(target_lamp, spawn_point, 0, False)
                        spawned_lamp['spawn_parent'] = spawn_point
                        spawned_lamp['unload_distance'] = spawn_point['unload_distance']
                        spawned_lamp['use_shadow'] = True
                        spawned_lamp['use_contact_shadow'] = False

                        self.spawns.append(spawned_lamp)
                        spawn_point['object'] = spawned_lamp

                        lamp_data = spawn_point['object'].blenderObject.data
                        lamp_data.type = spawn_point['light_type']
                        lamp_data.color = [spawn_point['value_red'], spawn_point['value_green'], spawn_point['value_blue']]
                        lamp_data.energy = spawn_point['value_energy']
                        lamp_data.use_custom_distance = True
                        lamp_data.cutoff_distance = 180.0
                        lamp_data.shadow_buffer_clip_start = 0.05
                        spawned_lamp.worldOrientation = spawned_lamp['spawn_parent'].worldOrientation
                        spawned_lamp['lamp_data'] = lamp_data

                        spawn_point['master_lamp'] = target_lamp

                        target_lamp['active_spawn'] = True
                        spawn_point['has_object'] = True
                        spawned_lamp.setParent(spawn_point)
                        self.dynalamps_idle.remove(target_lamp)

                        self.manageSpecialLights(spawned_lamp)

                elif spawn_point['type'] == 'object':

                    if spawn_point['object_name'] in blender_system_inactive_object_list:

                        target_object = blender_system_inactive_object_list[spawn_point['object_name']]

                        spawned_object = target_scene.addObject(target_object, spawn_point, 0, False)
                        spawned_object['spawn_parent'] = spawn_point
                        spawned_object['unload_distance'] = spawn_point['unload_distance']

                        self.spawns.append(spawned_object)
                        spawn_point['object'] = spawned_object
                        spawn_point['has_object'] = True

                        # print("Added object.")

                        if spawned_object.children:

                            for game_object in spawned_object.children:

                                if 'spawn' in game_object:

                                    self.streamed_spawn_points.append(game_object)
                                    print(game_object.name)
                                    # print("Added spawn point.")

                        elif not spawned_object.children:

                            print("No children.")

            def removeObject(self, spawn_point):

                spawn_point['has_object'] = False

            def unspawn(self, spawn):

                spawn_id = spawn['spawn_parent']['object']

                if 'dynalamp' in spawn:

                    master_lamp = spawn['spawn_parent']['master_lamp']

                    master_lamp['active_spawn'] = False
                    self.spawns.remove(spawn_id)
                    spawn_id.endObject()
                    spawn.endObject()

                elif 'dynalamp' not in spawn:

                    for child in spawn.children:

                        if 'spawn' in child:

                            self.streamed_spawn_points.remove(child)
                            # print("Removed child.")

                    else:

                        self.spawns.remove(spawn_id)
                        # self.spawns_remove_ready.remove(spawn)
                        spawn_id.endObject()
        
            def populateWorld(self, targeted_scene=bge.logic.getCurrentScene()):

                target_scene = targeted_scene
                blender_system_active_object_list = targeted_scene.objects
                blender_system_inactive_object_list = targeted_scene.objectsInactive
                target_camera = target_scene.active_camera

                # print("Populating world...")

                self.updateLists(target_camera)

                mapped = list(map(self.addObject, self.spawn_points_unnacounted_within_proximity))
                mapped_two = list(map(self.removeObject, self.spawn_points_unnacounted_outside_proximity))
                mapped_three = list(map(self.unspawn, self.spawns_remove_ready))
                # print(mapped)

                # for spawn_point in self.spawn_points_unnacounted_within_proximity:

                #     if spawn_point['type'] == 'light':

                #         if self.dynalamps_idle:

                #             target_lamp = self.dynalamps_idle[0]

                #             spawned_lamp = target_scene.addObject(target_lamp, spawn_point, 0, False)
                #             spawned_lamp['spawn_parent'] = spawn_point
                #             spawned_lamp['unload_distance'] = spawn_point['unload_distance']
                #             spawned_lamp['use_shadow'] = True
                #             spawned_lamp['use_contact_shadow'] = False

                #             self.spawns.append(spawned_lamp)
                #             spawn_point['object'] = spawned_lamp

                #             lamp_data = spawn_point['object'].blenderObject.data
                #             lamp_data.type = spawn_point['light_type']
                #             lamp_data.color = [spawn_point['value_red'], spawn_point['value_green'], spawn_point['value_blue']]
                #             lamp_data.energy = spawn_point['value_energy']
                #             lamp_data.use_custom_distance = True
                #             lamp_data.cutoff_distance = 180.0
                #             lamp_data.shadow_buffer_clip_start = 0.05
                #             spawned_lamp.worldOrientation = spawned_lamp['spawn_parent'].worldOrientation
                #             spawned_lamp['lamp_data'] = lamp_data

                #             spawn_point['master_lamp'] = target_lamp

                #             target_lamp['active_spawn'] = True
                #             spawn_point['has_object'] = True
                #             spawned_lamp.setParent(spawn_point)
                #             self.dynalamps_idle.remove(target_lamp)

                #             self.manageSpecialLights(spawned_lamp)

                #     elif spawn_point['type'] == 'object':

                #         if spawn_point['object_name'] in blender_system_inactive_object_list:

                #             target_object = blender_system_inactive_object_list[spawn_point['object_name']]

                #             spawned_object = target_scene.addObject(target_object, spawn_point, 0, False)
                #             spawned_object['spawn_parent'] = spawn_point
                #             spawned_object['unload_distance'] = spawn_point['unload_distance']

                #             self.spawns.append(spawned_object)
                #             spawn_point['object'] = spawned_object
                #             spawn_point['has_object'] = True

                #             # print("Added object.")

                #             if spawned_object.children:

                #                 for game_object in spawned_object.children:

                #                     if 'spawn' in game_object:

                #                         self.streamed_spawn_points.append(game_object)
                #                         print(game_object.name)
                #                         # print("Added spawn point.")

                #             elif not spawned_object.children:

                #                 print("No children.")

                # for spawn_point in self.spawn_points_unnacounted_outside_proximity:

                #     spawn_point['has_object'] = False

                # for spawn in self.spawns_remove_ready:

                #     spawn_id = spawn['spawn_parent']['object']

                #     if 'dynalamp' in spawn:

                #         master_lamp = spawn['spawn_parent']['master_lamp']

                #         master_lamp['active_spawn'] = False
                #         self.spawns.remove(spawn_id)
                #         spawn_id.endObject()
                #         spawn.endObject()

                #     elif 'dynalamp' not in spawn:

                #         for child in spawn.children:

                #             if 'spawn' in child:

                #                 self.streamed_spawn_points.remove(child)
                #                 # print("Removed child.")

                #         else:

                #             self.spawns.remove(spawn_id)
                #             # self.spawns_remove_ready.remove(spawn)
                #             spawn_id.endObject()

                # # else:

                # #     for spawn in self.spawns_remove_ready:

                # #         # print(spawn)
                # #         # print(self.spawns.count(spawn))
                # #         # self.spawns.remove(spawn)
                # #         # print(len(self.spawns))
                # #         # spawn.endObject()
                # #         print("Ended object.")

            def sortObjectBasedOnProperties(self, game_object):

                if 'spawn' in game_object and game_object['render'] == True:

                    self.constant_spawn_points.append(game_object)
                    self.streamed_spawn_points.append(game_object)

                if 'parkour' in game_object and game_object['render'] == True:

                    script_runner['engine_elements'].parkour_points.append(game_object)

                if 'dynalamp' in game_object:

                    self.dynalamps.append(game_object)
                    self.dynalamps_idle.append(game_object)
                    # print(game_object)
            
            def sortRenderObjects(self, library_data):

                self.render_objects_active = [blender_object for blender_object in library_data if "render" in blender_object.game.properties and blender_object.game.properties['render'].value == True]
                self.render_objects_inactive = [blender_object for blender_object in library_data if "render" in blender_object.game.properties and blender_object.game.properties['render'].value == False]
            
            def updateLists(self, proximity_reference):

                self.spawn_points_unnacounted_within_proximity = [spawn_point for spawn_point in self.streamed_spawn_points if proximity_reference.getVectTo(spawn_point)[0] < spawn_point['unload_distance']*1000 and not spawn_point['has_object']]
                self.spawn_points_unnacounted_outside_proximity = [spawn_point for spawn_point in self.streamed_spawn_points if proximity_reference.getVectTo(spawn_point)[0] > spawn_point['unload_distance']*1000 and spawn_point['has_object']]
                self.dynalamps_idle = [lamp for lamp in self.dynalamps if not lamp['active_spawn']]
                self.dynalamps_in_use = [lamp for lamp in self.dynalamps if lamp['active_spawn']]
                self.spawns_remove_ready = [spawn for spawn in self.spawns if spawn in shell_scene.objects and proximity_reference.getVectTo(spawn)[0] > spawn['unload_distance']*1000]
                # self.spawns = [spawn for spawn in self.spawns if spawn not in self.spawns_remove_ready]
                self.lamps_out_of_range_shadow = [lamp for lamp in self.spawns if not lamp.invalid and 'dynalamp' in lamp and proximity_reference.getVectTo(lamp)[0] > (lamp['unload_distance']*self.shadow_activation_distance)*self.unload_distance_modifier]
                self.lamps_in_range_shadow = [lamp for lamp in self.spawns if not lamp.invalid and 'dynalamp' in lamp and proximity_reference.getVectTo(lamp)[0] < (lamp['unload_distance']*self.shadow_activation_distance)*self.unload_distance_modifier]
                self.lamps_out_of_range_contact_shadow = [lamp for lamp in self.spawns if not lamp.invalid and 'dynalamp' in lamp and proximity_reference.getVectTo(lamp)[0] > (lamp['unload_distance']*self.contact_shadow_activation_distance)*self.unload_distance_modifier]
                self.lamps_in_range_contact_shadow = [lamp for lamp in self.spawns if not lamp.invalid and 'dynalamp' in lamp and proximity_reference.getVectTo(lamp)[0] < (lamp['unload_distance']*self.contact_shadow_activation_distance)*self.unload_distance_modifier]
                self.lamps_that_have_scheduling = [lamp for lamp in self.spawns if not lamp.invalid and 'dynalamp' in lamp and 'schedule' in lamp['spawn_parent']]

                # wonky_lamps = [sp for sp in self.streamed_spawn_points if sp['has_object']]

                # print(wonky_lamps)


        class audioSystem: # class wrapper for the audio system

            def __init__(self, master_volume=100, music_volume=100, sfx_volume=100, dialogue_volume=100, music_dimmer_coefficient=0.30): # initialize the audioSystem class

                self.device = aud.Device() # assign the audio device that will be used to play the audio
                
                self.master_volume = master_volume # assign the master volume for the audio system (affects all audio and no audio can get louder than this value)
                self.music_volume = music_volume # assign the music volume for the audio system
                self.sfx_volume = sfx_volume # assign the sound fx volume for the audio system
                self.dialogue_volume = dialogue_volume # assign the dialogue volume for the audio system
                self.music_dimmer_coefficient = music_dimmer_coefficient # assign the modifier that music volume will be multiplied by to lower volume when dialogue is playing
                self.dimmer_speed = 2.0

                self.threads = self.audioThreads(self.device, self) # assign the audioThreads objects that will be used by the audio system

            def getThreadManager(self): # define the method getThreadManager, which returns the threads object that the audio system is using

                return self.threads # return the current threads object

            def updateState(self): # define the method updateState, which keeps the audio system up to date (deprecated: use playQueue instead)

                #self.threads.music_thread.playQueue(self.threads.music_thread)
                pass

            def playSound(self, threads=None, type="", layer=0, sound=None, keep_in_memory=False, volume=1.0): # define the method playSound, which adds a sound to the audioThreads queue and initializes playback

                if not threads:

                    threads = self.threads
                
                sound_file = aud.Sound.file(sound) # assign the sound to a variable to be used

                if sound_file: # check if the sound file exists
                
                    if type == "music": # check if the sound type is music

                        music_packet = (layer, sound_file, keep_in_memory, volume) # compose the music packet, which consists of the playback layer, the sound file, boolean for keeping the sound file in memory and the volume

                        if music_packet not in threads.music.queued: # make sure that the music packet is not in the queue already to prevent duplicates

                            if len(threads.music.queued) < 10: # make sure that the queue list has less than x amount of members to prevent memory overflow

                                threads.music.queued.append(music_packet) # add the music packet to the queue
                                threads.music.playQueue(threads.music) # start playing the queue to play the sound

                        return threads.music # return the thread
                    
                    if type == "dialogue": # check if the sound type is music

                        dialogue_packet = (layer, sound_file, keep_in_memory, volume) # compose the music packet, which consists of the playback layer, the sound file, boolean for keeping the sound file in memory and the volume

                        if dialogue_packet not in threads.dialogue.queued: # make sure that the music packet is not in the queue already to prevent duplicates

                            if len(threads.dialogue.queued) < 10: # make sure that the queue list has less than x amount of members to prevent memory overflow

                                threads.dialogue.queued.append(dialogue_packet) # add the music packet to the queue
                                threads.dialogue.playQueue(threads.dialogue) # start playing the queue to play the sound

                        return threads.dialogue # return the thread

            class audioThreads: # class wrapper for the audio threads subsystem

                def __init__(self, device, parent): # initialize the audioThreads class

                    self.active_device = device # assign the audio device that will be used to play the audio
                    
                    self.dialogue = self.dialogueThreadPrimary(self.active_device, parent) # assign the dialogue thread, which will be used to play any dialogue within the game
                    self.music = self.musicThreadPrimary(self.active_device, parent) # assign the music thread, which will be used to play any music within the game
                    self.sfx = self.sfxThread(self.active_device, parent) # assign the sound fx thread, which will be used to play any sound fx within the game

                    self.parent = parent

                class dialogueThreadPrimary: # class wrapper for the primary dialogue thread super subsystem

                    def __init__(self, device, parent): # initialize the dialogueThreadPrimary class

                        self.device = device # assign the audio device that will be used to play the audio
                        self.parent_system = parent

                        self.queued = [] # assign an empty list to be used as the queue list
                        self.active = [] # assign an empty list to be used as the active sounds list
                        self.layers = [] # assign an empty list to be used as the active layers list
                        self.device = device # assign the audio device that will be used to play the audio

                        self.actual_volume = 0 # assign value for the actual volume that dialogue will have after all the volume variables have been calculated

                    def updateState(self):

                        thread = self

                        normalized_master_volume = thread.parent_system.master_volume/100
                        normalized_dialogue_volume = thread.parent_system.dialogue_volume/100
                        actual_volume = normalized_master_volume*normalized_dialogue_volume


                        self.actual_volume = actual_volume

                    def isPlaying(self, layer): # define the method isPlaying, which returns whether a given layer is playing audio

                        if layer in self.layers: # check if the requested layer is in the active layers list

                            is_playing = True # if layer is in the list set the play state to True

                        elif layer not in self.layers: # otherwise, if the requested layer is not in the active layers list

                            is_playing = False # set the play state to False

                        return is_playing # return if audio is playing in the requested layer
                    
                    def playQueue(self, thread): # define the method playQueue, which initializes playback from the queue

                        if not thread:

                            thread = self.parent_system.threads
                        
                        for sound_packet in thread.queued: # loop through each sound packet within the play queue list

                            if sound_packet[0] not in thread.layers: # check if the layer associated with the current sound packet is in the layer list (if it is that means that a sound is playing in that layer)
                                
                                thread.layers.append(sound_packet[0]) # add the sound packet's layer to the layer list to signify that playback is ready to begin
                                handle = thread.device.play(sound_packet[1], sound_packet[2]) # create the handle (object that allows the playback to be controlled) from the sound file object and the keep in memory value, then play sound
                                handle.volume = sound_packet[3]*self.actual_volume # set the playback volume to the volume value set in the sound packet
                                thread.active.append((handle, sound_packet)) # append the handle and its sound packet to the active audio list
                                thread.queued.remove(sound_packet) # remove the sound packet from the queue to prevent playing duplicates

                        if len(thread.active) > 0: # if the list of active audio is not empty
                        
                            for handle_packet in thread.active: # loop through the list of active music

                                handle = handle_packet[0] # get the audio handle object

                                if handle.status == True:

                                    handle.volume = handle_packet[1][3]*self.actual_volume
                                    thread.parent_system.threads.music.dimmed = True
                                    thread.parent_system.threads.music.dim_animated = True


                                if handle.status == False: # if the handle has stopped playing

                                    thread.parent_system.threads.music.dimmed = False
                                    thread.parent_system.threads.music.dim_animated = True
                                    thread.layers.remove(handle_packet[1][0]) # remove the handle's layer from the active layer list to allow for new audio to be played in the respective layer
                                    thread.active.remove(handle_packet) # remove the handle's packet from the active music list


                
                class musicThreadPrimary: # class wrapper for the primary music thread super subsystem

                    def __init__(self, device, parent): # initialize the musicThreadPrimary class

                        self.queued = [] # assign an empty list to be used as the queue list
                        self.active = [] # assign an empty list to be used as the active sounds list
                        self.layers = [] # assign an empty list to be used as the active layers list
                        self.device = device # assign the audio device that will be used to play the audio
                        self.parent_system = parent
                        self.dimmed = False

                        self.actual_volume = 0
                        self.dimmed_volume = 0
                        self.dim_difference = 0
                        self.dim_increment = 0

                    def updateState(self):

                        thread = self

                        normalized_master_volume = thread.parent_system.master_volume/100
                        normalized_music_volume = thread.parent_system.music_volume/100
                        actual_volume = normalized_master_volume*normalized_music_volume
                        dimmed_volume = actual_volume*thread.parent_system.music_dimmer_coefficient


                        self.actual_volume = actual_volume
                        self.dimmed_volume = dimmed_volume

                        self.dim_difference = self.actual_volume - self.dimmed_volume
                        self.dim_increment = round((self.dim_difference/(self.parent_system.dimmer_speed*100)), 3)

                    def isPlaying(self, layer): # define the method isPlaying, which returns whether a given layer is playing audio

                        if layer in self.layers: # check if the requested layer is in the active layers list

                            is_playing = True # if layer is in the list set the play state to True

                        elif layer not in self.layers: # otherwise, if the requested layer is not in the active layers list

                            is_playing = False # set the play state to False

                        return is_playing # return if audio is playing in the requested layer

                    def playQueue(self, thread): # define the method playQueue, which initializes playback from the queue

                        if not thread:

                            thread = self.parent_system.threads
                        
                        for sound_packet in thread.queued: # loop through each sound packet within the play queue list

                            if sound_packet[0] not in thread.layers: # check if the layer associated with the current sound packet is in the layer list (if it is that means that a sound is playing in that layer)
                                
                                thread.layers.append(sound_packet[0]) # add the sound packet's layer to the layer list to signify that playback is ready to begin
                                handle = thread.device.play(sound_packet[1], sound_packet[2]) # create the handle (object that allows the playback to be controlled) from the sound file object and the keep in memory value, then play sound
                                handle.volume = sound_packet[3]*self.actual_volume # set the playback volume to the volume value set in the sound packet
                                thread.active.append((handle, sound_packet)) # append the handle and its sound packet to the active audio list
                                thread.queued.remove(sound_packet) # remove the sound packet from the queue to prevent playing duplicates

                        if len(thread.active) > 0: # if the list of active audio is not empty
                        
                            for handle_packet in thread.active: # loop through the list of active music

                                handle = handle_packet[0] # get the audio handle object

                                if handle.status == True:

                                    # print(handle.volume)
                                    # print(self.dimmed_volume, self.actual_volume, self.parent_system.dimmer_speed*100, self.dim_increment)

                                    if self.dimmed:

                                        if handle.volume > handle_packet[1][3]*self.dimmed_volume:

                                            handle.volume -= self.dim_increment

                                        elif handle.volume < handle_packet[1][3]*self.dimmed_volume:

                                            handle.volume = handle_packet[1][3]*self.dimmed_volume
                                        
                                        # handle.volume = handle_packet[1][3]*self.dimmed_volume

                                    elif not self.dimmed:

                                        if handle.volume < handle_packet[1][3]*self.actual_volume:

                                            handle.volume += self.dim_increment

                                        elif handle.volume > handle_packet[1][3]*self.actual_volume:

                                            handle.volume = handle_packet[1][3]*self.actual_volume

                                        # handle.volume = handle_packet[1][3]*self.actual_volume

                                if handle.status == False: # if the handle has stopped playing

                                    thread.layers.remove(handle_packet[1][0]) # remove the handle's layer from the active layer list to allow for new audio to be played in the respective layer
                                    thread.active.remove(handle_packet) # remove the handle's packet from the active music list



                class sfxThread:

                    def __init__(self, device, parent):

                        self.device = device # assign the audio device that will be used to play the audio
                        self.parent_system = parent

                        self.queued = [] # assign an empty list to be used as the queue list
                        self.active = [] # assign an empty list to be used as the active sounds list
                        self.layers = [] # assign an empty list to be used as the active layers list
                        self.device = device # assign the audio device that will be used to play the audio
                        self.parent_system = parent

                        self.actual_volume = 0

                    def updateState(self):

                        thread = self

                        normalized_master_volume = thread.parent_system.master_volume/100
                        normalized_dialogue_volume = thread.parent_system.dialogue_volume/100
                        actual_volume = normalized_master_volume*normalized_dialogue_volume


                        self.actual_volume = actual_volume

                    def isPlaying(self, layer): # define the method isPlaying, which returns whether a given layer is playing audio

                        if layer in self.layers: # check if the requested layer is in the active layers list

                            is_playing = True # if layer is in the list set the play state to True

                        elif layer not in self.layers: # otherwise, if the requested layer is not in the active layers list

                            is_playing = False # set the play state to False

                        return is_playing # return if audio is playing in the requested layer


        class cinematicSystem:

            def __init__(self):

                self.target_camera = None

            def updateState(self):

                cinematic_camera = shell_scene.active_camera

                for object in shell_scene.objects:

                    if object.getDistanceTo(cinematic_camera) > 5:

                        object.color = [1.0, 1.0, 1.0, 1.0]

                    elif object.getDistanceTo(cinematic_camera) < 2:

                        object.color = [1.0, 1.0, 1.0, 0.2]

                def updateCinematicElements(self):

                    if isinstance(self.target_camera, str):

                        if self.target_camera in shell_scene.objects:

                            cinematic_camera = shell_scene.objects[self.target_camera]

                            if shell_scene.active_camera != cinematic_camera:

                                cinematic_camera.setParent(cinematic_camera['pivot'])
                                shell_scene.active_camera = cinematic_camera
                                # print(shell_scene.active_camera)

                    elif isinstance(self.target_camera, g7Engine.g7Elements.gameCamera):

                        if self.target_camera.object in shell_scene.objects:

                            cinematic_camera = self.target_camera.object

                            if shell_scene.active_camera != cinematic_camera:

                                cinematic_camera.setParent(cinematic_camera['pivot'])
                                shell_scene.active_camera.worldPosition = cinematic_camera.worldPosition
                                shell_scene.active_camera.worldOrientation = cinematic_camera.worldOrientation
                                # shell_scene.active_camera = cinematic_camera

                updateCinematicElements(self)
        
        class controlSystem: # class wrapper for the controls system

            def __init__(self): # initialize the controlSystem class

                self.active_keyboard = bge.logic.keyboard # assign the keyboard that will be used to provide input
                self.active_gamepads = bge.logic.joysticks # assign a list of all active gamepads being used
                self.main_gamepad = bge.logic.joysticks[0] # assign the primary gamepad, which will be used as the main input provider
                self.active_mouse = bge.logic.mouse

                self.queue_check_source = None

                self.gamepadA = 0 # assign the A BUTTON on an XBox controller
                self.gamepadB = 1 # assign the B BUTTON on an XBox controller
                self.gamepadX = 2 # assign the X BUTTON on an XBox controller
                self.gamepadY = 3 # assign the Y BUTTON on an XBox controller
                self.gamepadBack = 4 # assign the BACK BUTTON on an XBox controller
                self.gamepadStart = 6 # assign the START BUTTON on an XBox controller
                self.gamepadLStickButton = 7 # assign the LEFT STICK BUTTON on an XBox controller
                self.gamepadRStickButton = 8 # assign the RIGHT STICK BUTTON on an XBox controller
                self.gamepadLButton = 9 # assign the LEFT BUMPER on an XBox controller
                self.gamepadRButton = 10 # assign the RIGHT BUMPER on an XBox controller
                self.gamepadDUp = 11 # assign the UP DPAD BUTTON on an XBox controller
                self.gamepadDDown = 12 # assign the DOWN DPAD BUTTON on an XBox controller
                self.gamepadDLeft = 13 # assign the LEFT DPAD BUTTON on an XBox controller
                self.gamepadDRight = 14 # assign the RIGHT DPAD BUTTON on an XBox controller

                self.gamepadLStick = 15 # assign the LEFT STICK on an XBox controller
                self.gamepadRStick = 16 # assign the RIGHT STICK on an XBox controller
                self.gamepadLTrigger = 17 # assign the LEFT TRIGGER on an XBox controller
                self.gamepadRTrigger = 18 # assign the RIGHT TRIGGER on an XBox controller

                self.axisThreshold = 0.15 # assign the axis threshold for the left and right stick (anything below this value is considered the deadzone)

                self.activeGamepadInputs = [] # assign list for the active inputs sensed by the engine
                self.activeKeyboardInputs = []
                self.activeMouseInputs = []
                self.axisStates = [] # assign list for the axis states of the sticks and triggers, which determine whether they are active or not

                self.gamepadLStickValue = None # assign values of the left stick input (tuple of two: horizontal and vertical)
                self.gamepadRStickValue = None # assign values of the right stick input (tuple of two: horizontal and vertical)
                self.gamepadLTriggerValue = None # assign values of the left trigger input
                self.gamepadRTriggerValue = None # assign values of the right trigger input

                self.vibrateTemplatePunch = (0.5, 0.3, 100, True) # assign values for a vibrate template, in this case, a punch
                self.vibrateTemplateBadFall = (0.9, 0.9, 500, True) # assign values for a vibrate template, in this case, a bad fall from height
                self.vibrateTemplateExplosionNear = (1.0, 1.0, 1000, True) # assign values for a vibrate template, in this case, a nearby explosion
                self.vibrateTemplateExplosionFar = (0.4, 0.3, 1000, True) # assign values for a vibrate template, in this case, a faraway explosion
                self.vibrateTemplateCriticalHit = (1.0, 1.0, 250, True) # assign values for a vibrate template, in this case, a critical hit
                self.vibrateTemplateTest = (1.0, 1.0, 250, True) # assign values for a vibrate template, in this case, a critical hit

                self.gamepad_just_activated = [] # assign list of all gamepad inputs registered as just activated
                self.gamepad_just_released = [] # assign list of all gamepad inputs registered as just released

                self.keyboard_just_activated = [] # assign list of all keyboard inputs registered as just activated
                self.keyboard_just_released = [] # assign list of all keyboard inputs registered as just released

                self.mouse_just_activated = [] # assign list of all mouse inputs registered as just activated
                self.mouse_just_released = [] # assign list of all mouse inputs registered as just released

                self.check_time = 0 # assign value of last check time when state was updated and keystrokes were checked
                self.interval = script_runner['frame_time_interval'] # assign interval to update state and check keystrokes
                self.active_keyboard_image = [] # assign keyboard keystroke states from the previous frame
                self.active_gamepad_image = [] # assign gamepad press states from the previous frame

                self.tap_threshold = 0.195 # assign the tap threshold below which an input is registered as a tap
                self.tap_wait_time = 0.12 # assign the tap wait time between which taps are not registered to allow for a double tap to be checked for
                self.hold_wait_time = 1.0 # assign the hold wait time above which an input is registered as a hold
                self.tap_gray_area = (self.tap_threshold + 0.1, self.hold_wait_time - 0.1) # assign the tap gray area where a press is considered too long to be a tap and too short to be a hold
                self.gamepad_monitoring = [] # assign list of gamepad presses being monitored for input type
                self.keyboard_monitoring = [] # assign list of keyboard presses being monitored for input type
                self.mouse_monitoring = [] # assign list of mouse clicks being monitored for input type
                self.gamepad_input_times = [] # assign a list of gamepad press input times that correspond with the gamepad monitoring list to allow for timing the input type
                self.keyboard_input_times = [] # assign a list of keyboard press input times that correspond with the keyboard monitoring list to allow for timing the input type
                self.mouse_input_times = [] # assign a list of mouse click input times that correspond with the mouse monitoring list to allow for timing the input type

                self.gamepad_tapped = [] # assign a list that will temporarily hold the most recently tapped gamepad buttons and feed the inputs to the queue
                self.gamepad_double_tapped = [] # assign a list that will temporarily hold the most recently double tapped gamepad buttons and feed the inputs to the queue
                self.gamepad_held = [] # assign a list that will temporarily hold the most recently held gamepad buttons and feed the inputs to the queue

                self.keyboard_tapped = [] # assign a list that will temporarily hold the most recently tapped keyboard keys and feed the inputs to the queue
                self.keyboard_double_tapped = [] # assign a list that will temporarily hold the most recently double tapped keyboard keys and feed the inputs to the queue
                self.keyboard_held = [] # assign a list that will temporarily hold the most recently held keyboard keys and feed the inputs to the queue

                self.mouse_tapped = [] # assign a list that will temporarily hold the most recently tapped mouse clicks and feed the inputs to the queue
                self.mouse_double_tapped = [] # assign a list that will temporarily hold the most recently double tapped mouse clicks and feed the inputs to the queue
                self.mouse_held = [] # assign a list that will temporarily hold the most recently held mouse clicks and feed the inputs to the queue

                self.mouse_ignore = [124, 125, 126, 127] # assign list of mouse inputs to ignore as they are either finicky or not stable enough to be monitored (mouse wheel up/down and mouse move x/y)

                self.inputJustActivated = [] # assign a list of inputs that have just been activated
                self.inputJustRealeased = [] # assign a list of inputs that have just been released

                self.queue = [] # assign a list of all inputs in the waiting queue

                self.queue_wait_time = 0.8 # assign the longest amount of time that an input can remain in the queue before it is cleared

                self.TAP = 0 # assign the value of an input considered a tap
                self.DOUBLETAP = 1 # assign the value of an input considered a double tap
                self.HELD = 2 # assign the value of an input considered a hold

                self.keymap = g7Engine.g7KeyMaps.dfKeyMap(self)

            def updateState(self): # define the method updateState, which keeps the system in a current state

                current_time = bge.logic.getFrameTime() # get the current engine time, cache as variable
                # print(self.active_key_image)
                # print(self.main_gamepad.activeButtons)

                # if self.main_gamepad == None: # if no joysticks/gamepads are registered by the engine

                #     self.main_gamepad = bge.logic.joysticks[0] # set the main gamepad to the first gamepad registered in the joystick list
                
                if bge.logic.joysticks: # and self.main_gamepad != None: # if any joysticks/gamepads are registered by the engine

                    self.active_gamepads = bge.logic.joysticks
                    # print(self.active_gamepads)

                    # self.main_gamepad = bge.logic.joysticks[0] # set the main gamepad to the first gamepad registered in the joystick list

                    for gamepad in self.active_gamepads:

                        if gamepad:

                            # self.main_gamepad = gamepad

                            # print(gamepad.name, self.active_gamepads.index(gamepad))

                            if -self.axisThreshold > gamepad.axisValues[0] or gamepad.axisValues[0] > self.axisThreshold or -self.axisThreshold > gamepad.axisValues[1] or gamepad.axisValues[1] > self.axisThreshold: # if the left stick is not in an idle position

                                if self.gamepadLStick not in self.axisStates: # if the left stick is not in the active list

                                    self.axisStates.append(self.gamepadLStick) # add the left stick to the active list

                                self.gamepadLStickValue = (round(gamepad.axisValues[0], 3), round(gamepad.axisValues[1], 3)) # set the left stick values for both x and y

                            else: # however if the left stick is in an idle position

                                if self.gamepadLStick in self.axisStates: # if the left stick is in the active list

                                    self.axisStates.remove(self.gamepadLStick) # remove the left stick from the active list
                                
                                self.gamepadLStickValue = (0.0, 0.0) # set the value of the left stick to 0.0 to prevent input processing while in idle position

                            if -self.axisThreshold > gamepad.axisValues [2] or gamepad.axisValues[2] > self.axisThreshold or -self.axisThreshold > gamepad.axisValues[3] or gamepad.axisValues[3] > self.axisThreshold: # if the right stick is not in an idle position

                                if self.gamepadRStick not in self.axisStates: # if the right stick is not in the active list

                                    self.axisStates.append(self.gamepadRStick) # add the right stick to the active list
                                
                                self.gamepadRStickValue = (round(gamepad.axisValues[2], 3), round(gamepad.axisValues[3], 3)) # set the left stick values for both x and y

                            else: # however if the right stick is in an idle position

                                if self.gamepadRStick in self.axisStates: # if the right stick is in the active list

                                    self.axisStates.remove(self.gamepadRStick) # remove the right stick from the active list
                                
                                self.gamepadRStickValue = (0.0, 0.0) # set the value of the right stick to 0.0 to prevent input processing while in idle position

                            if gamepad.axisValues[4] > self.axisThreshold: # if the left trigger is not in an idle position

                                if self.gamepadLTrigger not in self.axisStates: # if the left trigger is not in the active list

                                    self.axisStates.append(self.gamepadLTrigger) # add the left trigger to the active list

                            else: # however if the left trigger is in an idle position

                                if self.gamepadLTrigger in self.axisStates: # if the left trigger is in the active list

                                    self.axisStates.remove(self.gamepadLTrigger) # remove the left trigger from the active list

                            if gamepad.axisValues[5] > self.axisThreshold: # if the right trigger is not in an idle position

                                if self.gamepadRTrigger not in self.axisStates: # if the right trigger is not in the active list

                                    self.axisStates.append(self.gamepadRTrigger) # add the right trigger to the active list

                            else: # however if the right trigger is in an idle poaition

                                if self.gamepadRTrigger in self.axisStates: # if the right trigger is in the active list

                                    self.axisStates.remove(self.gamepadRTrigger) # remove the right trigger from the active list

                            self.gamepadLTriggerValue = (round(gamepad.axisValues[4], 3)) # set the left trigger value
                            self.gamepadRTriggerValue = (round(gamepad.axisValues[5], 3)) # set the right trigger value

                            self.activeGamepadInputs = gamepad.activeButtons + self.axisStates # parse together the full active input list for the gamepad
                            # print(self.activeGamepadInputs)
                            # print(self.activeKeyboardInputs, self.active_keyboard.text)

                if current_time - self.check_time >= self.interval:
                    
                    if bge.logic.joysticks:

                        for button in self.activeGamepadInputs:

                            if button not in self.active_gamepad_image:

                                if button not in self.gamepad_just_activated:

                                    self.gamepad_just_activated.append(button)
                                    # print("Gamepad input registered to just activated.")
                                    # print(self.gamepad_just_activated)

                            elif button in self.active_gamepad_image:

                                if button in self.gamepad_just_activated:

                                    self.gamepad_just_activated.remove(button)
                                    # print("Gamepad input unregistered from just activated.")

                        for button in self.gamepad_just_activated:

                            if button not in self.activeGamepadInputs and button not in self.active_gamepad_image:

                                self.gamepad_just_activated.remove(button)

                        for button in self.active_gamepad_image:

                            if button not in self.activeGamepadInputs:

                                if button not in self.gamepad_just_released:

                                    self.gamepad_just_released.append(button)
                                    # print("Gamepad input registered to just released.")

                        for button in self.gamepad_just_released:

                            if button not in self.active_gamepad_image and button not in self.activeGamepadInputs:

                                self.gamepad_just_released.remove(button)
                                # print("Gamepad input unregistered from just released.")

                        self.active_gamepad_image = self.activeGamepadInputs

                    self.check_time = current_time

                # print(self.mouse_just_released, self.mouse_just_activated)
                
                self.activeKeyboardInputs = list(self.active_keyboard.activeInputs.keys())
                self.activeMouseInputs = list(self.active_mouse.activeInputs.keys())
                
                if self.activeKeyboardInputs:
                
                    for key in self.activeKeyboardInputs:

                        if self.active_keyboard.activeInputs[key].activated:

                            if key not in self.keyboard_just_activated:

                                self.keyboard_just_activated.append(key)

                        if not self.active_keyboard.activeInputs[key].activated:

                            if key in self.keyboard_just_activated:
                                
                                self.keyboard_just_activated.remove(key)

                for key in self.active_keyboard.inputs:

                    if self.active_keyboard.inputs[key].released:

                        if key not in self.keyboard_just_released:

                            self.keyboard_just_released.append(key)

                    elif not self.active_keyboard.inputs[key].released:

                        if key in self.keyboard_just_released:

                            self.keyboard_just_released.remove(key)

                if self.activeMouseInputs:

                    for click in self.activeMouseInputs:

                        if self.active_mouse.activeInputs[click].activated and click not in self.mouse_ignore:

                            if click not in self.mouse_just_activated:

                                self.mouse_just_activated.append(click)

                        if not self.active_mouse.activeInputs[click].activated:

                            if click in self.mouse_just_activated:
                                
                                self.mouse_just_activated.remove(click)

                for click in self.active_mouse.inputs:

                    if self.active_mouse.inputs[click].released and click not in self.mouse_ignore:

                        if click not in self.mouse_just_released:

                            self.mouse_just_released.append(click)

                    elif not self.active_mouse.inputs[click].released:

                        if click in self.mouse_just_released:

                            self.mouse_just_released.remove(click)

                # for key in self.keyboard_just_activated:

                #     if key not in self.activeKeyboardInputs:

                #         self.keyboard_just_activated.remove(key)

                if self.activeGamepadInputs:
                
                    for button in self.activeGamepadInputs:

                        if button not in self.gamepad_monitoring:

                            self.gamepad_monitoring.append(button)
                            self.gamepad_input_times.append(bge.logic.getFrameTime())

                if self.gamepad_monitoring:
                
                    for button in self.gamepad_monitoring:
                            
                        index = self.gamepad_monitoring.index(button)
                        self.monitorGamepadInputType((button, self.gamepad_input_times[index]))

                if self.activeKeyboardInputs:
                
                    for key in self.activeKeyboardInputs:

                        if key not in self.keyboard_monitoring:

                            self.keyboard_monitoring.append(key)
                            self.keyboard_input_times.append(bge.logic.getFrameTime())

                if self.keyboard_monitoring:
                
                    for key in self.keyboard_monitoring:

                        index = self.keyboard_monitoring.index(key)
                        self.monitorKeyboardInputType((key, self.keyboard_input_times[index]))

                if self.activeMouseInputs:
                
                    for click in self.activeMouseInputs:

                        if click not in self.mouse_monitoring and click not in self.mouse_ignore:

                            self.mouse_monitoring.append(click)
                            self.mouse_input_times.append(bge.logic.getFrameTime())

                if self.mouse_monitoring:
                
                    for click in self.mouse_monitoring:

                        index = self.mouse_monitoring.index(click)
                        self.monitorMouseInputType((click, self.mouse_input_times[index]))

                if self.queue:

                    self.manageQueue()


            def gamepadExists(self):

                if self.active_gamepads:

                    is_gamepad = True

                else:

                    is_gamepad = False

                return is_gamepad
            
            def gamepadInputStatus(self):

                pass
            
            def getActiveButtons(self):

                if bge.logic.joysticks:

                    # print(self.activeGamepadInputs)
                    # print(self.main_gamepad.axisValues)

                    return self.activeGamepadInputs

            def activateVibration(self, vibration_setup=(0, 0, 0, True)):

                if self.gamepadExists():

                    current_time = bge.logic.getFrameTime()

                    self.main_gamepad.strengthLeft = vibration_setup[0]
                    self.main_gamepad.strengthRight = vibration_setup[1]
                    self.main_gamepad.duration = vibration_setup[2]

                    tap_output = vibration_setup[3]

                    self.main_gamepad.startVibration()

                    if tap_output == True:

                        tap = True

            def monitorGamepadInputType(self,monitor_packet, still_active=True):

                input = monitor_packet[0]
                input_time = monitor_packet[1]

                source = self.main_gamepad

                # print(self.gamepad_input_times)

                # index = self.gamepad_monitoring.index(input)

                script_runner = bge.logic.getCurrentController().owner

                # print(monitor_packet)

                if input in self.gamepad_tapped:

                    if self.tap_threshold > bge.logic.getFrameTime() - input_time > self.tap_wait_time:

                        if input in self.gamepad_just_released:

                            # print("Double")
                            input_type = self.DOUBLETAP
                            self.gamepad_double_tapped.append(input)
                            self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))
                            
                            self.gamepad_tapped.remove(input)
                            self.gamepad_double_tapped.remove(input)
                            self.gamepad_input_times.remove(input_time)
                            self.gamepad_monitoring.remove(input)

                if bge.logic.getFrameTime() - input_time > self.tap_threshold and input in self.gamepad_tapped:

                    # print("Tap")
                    input_type = self.TAP
                    self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                    self.gamepad_tapped.remove(input)
                    self.gamepad_input_times.remove(input_time)
                    self.gamepad_monitoring.remove(input)
                
                if input not in self.gamepad_tapped:

                    if input not in self.gamepad_double_tapped:

                        if bge.logic.getFrameTime() - input_time < self.tap_threshold:

                            if input in self.gamepad_just_released:

                                if input in self.gamepad_monitoring:
                                
                                    self.gamepad_tapped.append(input)
                                    self.gamepad_input_times[self.gamepad_monitoring.index(input)] = bge.logic.getFrameTime()

                    if bge.logic.getFrameTime() - input_time > self.hold_wait_time:

                        if input in self.activeGamepadInputs:
                            
                            if input not in self.gamepad_held:

                                # print("Held")
                                input_type = self.HELD
                                self.gamepad_held.append(input)
                                self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                        if input not in self.activeGamepadInputs:

                            if input in self.gamepad_held:
                            
                                self.gamepad_held.remove(input)

                            self.gamepad_input_times.remove(input_time)
                            self.gamepad_monitoring.remove(input)

                    if self.tap_gray_area[0] < bge.logic.getFrameTime() - input_time < self.tap_gray_area[1]:

                        if input not in self.gamepad_tapped:

                            if input not in self.activeGamepadInputs:

                                self.gamepad_input_times.remove(input_time)
                                self.gamepad_monitoring.remove(input)
                                # print("Fluke")

            def monitorKeyboardInputType(self,monitor_packet):

                input = monitor_packet[0]
                input_time = monitor_packet[1]

                source = self.active_keyboard

                # print(self.gamepad_input_times)

                # index = self.gamepad_monitoring.index(input)

                script_runner = bge.logic.getCurrentController().owner

                # print(monitor_packet)

                if input in self.keyboard_tapped:

                    if self.tap_threshold > bge.logic.getFrameTime() - input_time > self.tap_wait_time:

                        if input in self.keyboard_just_released:

                            print("Double")
                            input_type = self.DOUBLETAP
                            self.keyboard_double_tapped.append(input)
                            self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))
                            
                            self.keyboard_tapped.remove(input)
                            self.keyboard_double_tapped.remove(input)
                            self.keyboard_input_times.remove(input_time)
                            self.keyboard_monitoring.remove(input)

                if bge.logic.getFrameTime() - input_time > self.tap_threshold and input in self.keyboard_tapped:

                    print("Tap")
                    input_type = self.TAP
                    self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                    self.keyboard_tapped.remove(input)
                    self.keyboard_input_times.remove(input_time)
                    self.keyboard_monitoring.remove(input)
                
                if input not in self.keyboard_tapped:

                    if input not in self.keyboard_double_tapped:

                        if bge.logic.getFrameTime() - input_time < self.tap_threshold:

                            if input in self.keyboard_just_released:

                                if input in self.keyboard_monitoring:
                                
                                    self.keyboard_tapped.append(input)
                                    self.keyboard_input_times[self.keyboard_monitoring.index(input)] = bge.logic.getFrameTime()

                    if bge.logic.getFrameTime() - input_time > self.hold_wait_time:

                        if input in self.activeKeyboardInputs:
                            
                            if input not in self.keyboard_held:

                                print("Held")
                                input_type = self.HELD
                                self.keyboard_held.append(input)
                                self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                        if input not in self.activeKeyboardInputs:

                            if input in self.keyboard_held:
                            
                                self.keyboard_held.remove(input)

                            self.keyboard_input_times.remove(input_time)
                            self.keyboard_monitoring.remove(input)

                    if self.tap_gray_area[0] < bge.logic.getFrameTime() - input_time < self.tap_gray_area[1]:

                        if input not in self.keyboard_tapped:

                            if input not in self.activeKeyboardInputs:

                                self.keyboard_input_times.remove(input_time)
                                self.keyboard_monitoring.remove(input)
                                print("Fluke")

            def monitorMouseInputType(self,monitor_packet):

                input = monitor_packet[0]
                input_time = monitor_packet[1]

                source = self.active_mouse

                # print(self.gamepad_input_times)

                # index = self.gamepad_monitoring.index(input)

                script_runner = bge.logic.getCurrentController().owner

                # print(monitor_packet)

                if input in self.mouse_tapped:

                    if self.tap_threshold > bge.logic.getFrameTime() - input_time > self.tap_wait_time:

                        if input in self.mouse_just_released:

                            print("Double")
                            input_type = self.DOUBLETAP
                            self.mouse_double_tapped.append(input)
                            self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))
                            
                            self.mouse_tapped.remove(input)
                            self.mouse_double_tapped.remove(input)
                            self.mouse_input_times.remove(input_time)
                            self.mouse_monitoring.remove(input)

                if bge.logic.getFrameTime() - input_time > self.tap_threshold and input in self.mouse_tapped:

                    print("Tap")
                    input_type = self.TAP
                    self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                    self.mouse_tapped.remove(input)
                    self.mouse_input_times.remove(input_time)
                    self.mouse_monitoring.remove(input)
                
                if input not in self.mouse_tapped:

                    if input not in self.mouse_double_tapped:

                        if bge.logic.getFrameTime() - input_time < self.tap_threshold:

                            if input in self.mouse_just_released:

                                if input in self.mouse_monitoring:
                                
                                    self.mouse_tapped.append(input)
                                    self.mouse_input_times[self.mouse_monitoring.index(input)] = bge.logic.getFrameTime()

                    if bge.logic.getFrameTime() - input_time > self.hold_wait_time:

                        if input in self.activeMouseInputs:
                            
                            if input not in self.mouse_held:

                                print("Held")
                                input_type = self.HELD
                                self.mouse_held.append(input)
                                self.queue.append((input, input_type, round(bge.logic.getFrameTime(), 3), source))

                        if input not in self.activeMouseInputs:

                            if input in self.mouse_held:
                            
                                self.mouse_held.remove(input)

                            self.mouse_input_times.remove(input_time)
                            self.mouse_monitoring.remove(input)

                    if self.tap_gray_area[0] < bge.logic.getFrameTime() - input_time < self.tap_gray_area[1]:

                        if input not in self.mouse_tapped:

                            if input not in self.activeMouseInputs:

                                self.mouse_input_times.remove(input_time)
                                self.mouse_monitoring.remove(input)
                                print("Fluke")

            def manageQueue(self):

                current_time = bge.logic.getFrameTime()
                
                for event in self.queue:

                    if current_time - event[2] > self.queue_wait_time:

                        self.queue.remove(event)
                        print("Event cleared from queue!")

            def readQueue(self, requested_input, source):

                if source == "gamepad":

                    self.queue_check_source = self.main_gamepad

                elif source == "keyboard":

                    self.queue_check_source = self.active_keyboard

                elif source == "mouse":

                    self.queue_check_source = self.active_mouse
                
                for event in self.queue:

                    if event[0] == requested_input:

                        if event[3] == self.queue_check_source:

                            event_type = event[1]
                            self.queue.remove(event)
                            self.queue_check_source = None
                            print(event_type)
                            return event_type

                    
        class statisticSystem:

            def __init__(self):

                pass


        class storySystem: # class wrapper for the story system

            def __init__(self):
                
                self.mission_system = self.missionSystem()
                self.story_progress = None


            class missionSystem:

                def __init__(self):
                    
                    self.current_mission = 0
                    self.completion_progress = None


        
        class parkourSystem:

            def __init__(self, engine_elements):

                self.main_character = None
                self.framework_elements_carrier = engine_elements
                self.leap_speed = 8
                self.memory_range = 5.0

                self.hook_threshold = 0.2
                
                self.active = False

            def analyzeSurroundings(self, character):

                if character:

                    # local_map = self.framework_elements_carrier.peruseNearbyObjects(character, 40.0, True, None, self.framework_elements_carrier.parkour_points)
                    if character.current_parkour_point:
                    
                        if character.object.getDistanceTo(character.current_parkour_point) > self.memory_range:

                            character.current_parkour_point = None
                            character.parkour_point_reached = False

                    local_map = self.retrieveNearbyPoints(character, character.parkour_seek_range, character.object)

                    return local_map
            
            def analyzeParkourPoint(self, character, parkour_point):

                distance_to_point = character.object.getDistanceTo(parkour_point)
                elevation_difference = parkour_point.worldPosition.z - character.object.worldPosition.z
                vector_to_point = character.object.getVectTo(parkour_point)

                return (distance_to_point, elevation_difference, vector_to_point[1], parkour_point.worldPosition, parkour_point)
            
            def jumpToPoint(self, character, statistics):

                multiplier = statistics[0]*character.parkour_leap_speed
                multiplied_vector = statistics[2]*multiplier
                modified_vector = (multiplied_vector[0], multiplied_vector[1], multiplied_vector[2]+(statistics[1]*10.0))
                modified_descending_vector = (multiplied_vector[0], multiplied_vector[1], multiplied_vector[2])
                applied_jump = character.applied_descent_jump
                
                if not character.parkour_point_reached and character.on_ground:

                    character.run_parkour = True

                elif character.parkour_point_reached:

                    if statistics[4] != character.current_parkour_point:

                        character.parkour_point_reached = False

                if character.run_parkour:

                    character.physics_controller.disableRigidBody()

                    if statistics[1] > 0:
                
                        if statistics[0] > self.hook_threshold:

                            character.physics_controller.setLinearVelocity(modified_vector, False)
                            character.physics_controller.alignAxisToVect(-statistics[2], 1, 0.2)

                            for object in shell_scene.objects:

                                if "obstacle" in object:

                                    collision_data = character.physics_controller.collide(object)
                                    
                                    if collision_data[0]:

                                        # print('Collided with obstacle.', collision_data)
                                        character.physics_controller.enableRigidBody()
                                        character.current_parkour_point = None
                                        character.parkour_point_reached = True
                                        character.jump_reset = True
                                        character.applied_descent_jump = False
                                        character.run_parkour = False

                    elif statistics[1] < 0:

                        if not applied_jump and character.jump_reset:

                            character.physics_controller.applyImpulse(character.physics_controller.worldPosition, (0, 0.0, 40.0), True)
                            character.applied_descent_jump = True
                            character.jump_reset = False

                        elif applied_jump and not character.jump_reset:

                            character.physics_controller.setLinearVelocity(modified_descending_vector, False)
                            character.physics_controller.alignAxisToVect(-statistics[2], 1, 0.2)

                    if statistics[0] <= self.hook_threshold:

                        character.physics_controller.setLinearVelocity((0,0,character.physics_controller.getLinearVelocity().z), False)
                        character.current_parkour_point = statistics[4]
                        character.parkour_point_reached = True
                        character.jump_reset = True
                        character.applied_descent_jump = False
                        character.physics_controller.enableRigidBody()
                        character.run_parkour = False

            def retrieveNearbyPoints(self, character, near_range, probe):

                parkour_points = []
                prober = probe
                charobj = character.object
                threshold_range = character.seek_banner

                for point in self.framework_elements_carrier.parkour_points:

                    char_vect_self = charobj.getVectTo(charobj.worldPosition)
                    char_vect_point = charobj.getVectTo(point)

                    # print(char_vect_self[1], char_vect_point[1])
                    
                    if point != character.current_parkour_point:

                        if character.parkour_probe.getDistanceTo(point) <= near_range and char_vect_point[2][1] < char_vect_self[2][1] and threshold_range > char_vect_point[2][0] > -threshold_range:

                            if character.minimum_parkour_range <= char_vect_point[0] <= character.maximum_parkour_range:

                                parkour_points.append((point, character.object.getDistanceTo(point)))
                                # print("Populating...")

                else:

                    # print("Complete.")
                    
                    if parkour_points:
                    
                        parkour_points.sort(key=lambda x: x[1])
                        # bge.render.drawLine(character.object.worldPosition, parkour_points[0][0].worldPosition, (0.5, 0.0, 1.0, 1.0))
                        # print(parkour_points[0][0], charobj.getVectTo(parkour_points[0][0])[2])

                        return parkour_points, parkour_points[0][0]

            class parkourNode:

                def __init__(self, parent_system, priority=0, linked_object=None):

                    self.active = False
                    self.parent_system = parent_system
                    self.priority = priority
                    self.object = linked_object
                    self.has_user = False

                def setLinkedObject(self, object):

                    self.object = object

                def setPriority(self, priority):

                    self.priority = priority

            class parkourP2P:

                def __init__(self, parent_system, priority=0, linked_object=None):

                    self.active = False
                    self.parent_system = parent_system
                    self.priority = priority
                    self.object = linked_object
                    self.within_user_radius = False

                def setLinkedObject(self, object):

                    self.object = object

        class playerSystem: # class wrapper for the player system

            def __init__(self):

                self.players_logged = 0
                self.players_max = 1
                self.players_active_slots = 0
                self.active = True

            def getPlayers(self):

                pass


        class settingsSystem:

            def __init__(self):

                self.bloom = True
                self.exposure = 0.0
                self.gamma = 1.0
                self.black_level = [0.0, 0.0, 0.0]
                self.white_level = [1.0, 1.0, 1.0]

                self.checking_for_key = False
                self.change_key_target = None

                control_system = script_runner['control_system']

                self.keyboard_modifier_key_list = [bge.events.LEFTSHIFTKEY, bge.events.RIGHTSHIFTKEY, bge.events.LEFTCTRLKEY, bge.events.RIGHTCTRLKEY, bge.events.LEFTALTKEY, bge.events.RIGHTALTKEY]

                self.keyboard_acceleration_keys = [control_system.gamepadLTrigger, control_system.gamepadRTrigger, control_system.gamepadLButton, control_system.gamepadRButton]

            def updateState(self):

                view_settings = bpy.context.scene.view_settings

                if view_settings.exposure != self.exposure:

                    view_settings.exposure = self.exposure

                if view_settings.curve_mapping.black_level != self.black_level:

                    view_settings.curve_mapping.black_level = self.black_level

                if view_settings.curve_mapping.white_level != self.white_level:

                    view_settings.curve_mapping.white_level = self.white_level



        class timeSystem: # class wrapper for the time system

            def __init__(self):

                self.year = 0
                self.month = 1
                self.day = 1
                self.hour = 23
                self.minute = 0
                self.second = 0
                self.separator = ":"
                self.speed_multiplier = 0.2
                self.interval = 1.0/self.speed_multiplier
                self.step = 60
                self.last_check = 0
                self.monthly_dict = { 1 : 31, 2 : 28, 3 : 31, 4 : 30, 5 : 31, 6 : 30, 7 : 31, 8 : 31, 9 : 30, 10 : 31, 11 : 30, 12 : 31}
                self.leap_year = False
                self.leap_year_counter = 0

                self.timer = 0
                self.stopwatch = 0

                self.updating = False

                self.display_time = f'{self.hour}%s{self.minute:02}%s{self.second:02}' % (self.separator, self.separator)
                self.display_date = f'{self.month}.{self.day}.{self.year:04}'

            def setTime(self, hour=None, minute=None, second=None):

                if hour: # if hour parameter has a value
                
                    self.hour = hour # set the current hour to the hour parameter value
                
                if minute: # if minute parameter has a value

                    self.minute = minute # set the current minute to the minute parameter value

                if second: # if second parameter has a value

                    self.second = second # set the current second to the second parameter value

            def changeSpeed(self, new_multiplier):

                if new_multiplier:

                    self.speed_multiplier = new_multiplier
                    self.interval = 1.0/self.speed_multiplier
            
            def updateState(self):

                current_time = bge.logic.getFrameTime()

                if current_time - self.last_check >= self.interval:

                    self.second += self.step
                    self.updating = True
                    self.last_check = bge.logic.getFrameTime()

                if self.second >= 60:

                    self.minute += int(self.second/60)
                    self.second = 0 + int(self.second % 60)
                    # self.updating = False

                if self.minute >= 60:

                    self.hour += int(self.minute/60)
                    self.minute = 0 + int(self.minute%60)
                    # self.updating = False

                if self.hour >= 24:

                    self.day += int(self.hour/24)
                    self.hour = 0 + int(self.hour%24)
                    # self.updating = False

                if self.hour < 0:

                    self.hour = 24 + self.hour
                    # self.updating = False

                if self.day >= 32:

                    self.month += int(self.day/31)
                    self.day = 1 + int(self.day%32)
                    # self.updating = False

                if self.month >= 13:

                    self.year += int(self.month/12)
                    self.month = 1 + int(self.month%13)
                    # self.updating = False

                # print(self.display_time)

                # if self.day > self.monthly_dict[self.month]:

                #     self.month +=int(self.day/self.monthly_dict[self.month])
                #     self.day = 1 + int(self.day%self.monthly_dict[self.month])

                # if self.month >= 12:

                #     self.month = 1 + int(self.month%self.monthly_dict[self.month])

                    # self.last_check = bge.logic.getFrameTime()
                    # print(self.display_time)
                    # print(self.display_date)
                    # print(self.monthly_dict[self.month])

                self.display_time = f'{self.hour}%s{self.minute:02}%s{self.second:02}' % (self.separator, self.separator)
                self.display_date = f'{self.month}.{self.day}.{self.year:04}'

        class worldSystem: # class wrapper for the world system

            def __init__(self):

                self.colors = self.colorLibrary

                self.DAY = [0.117, 0.557, 1.0, 1.0] # assign color constant for daytime
                self.EVENING = [0.105, 0.137, 0.311, 1.0] # assign color constant for evening
                self.MORNING = [0.033, 0.043, 0.080, 1.0] # assign color constant for morning
                self.NIGHT = [0.009, 0.008, 0.017, 1.0] # assign color constant for nighttime
                self.DEEP_NIGHT = [0.005, 0.003, 0.003, 1.0] # assign color constant for deep nighttime

                self.SUN_MORNING = [0.031, 0.011, 0.004]
                self.SUN_DAY = [1.0, 1.0, 1.0]
                self.SUN_EVENING = [0.274, 0.096, 0.196]
                self.SUN_NIGHT = [0.017, 0.005, 0.061]
                self.SUN_DEEPNIGHT = [0.004, 0.002, 0.011]
                
                self.weather = None
                self.is_day = False
                self.is_night = False

                self.active = False
                self.proceed = False

                self.color_from = None
                self.color_to = None

                self.sun_from = None
                self.sun_to = None

                self.hour = 0
                self.minute = 0
                self.second = 0

                self.world = bpy.data.scenes[0].world
                self.color_controller = self.world.node_tree.nodes['Background'].inputs['Color']
                self.cloud_color_controller = self.world.node_tree.nodes["Clouds.ColorOverlay"].inputs[7]

                self.progress_range_start = None
                self.progress_range_finish = None

                self.morning_range = [[8, 0, 0], [12, 0, 0]]
                self.day_range = [[15, 0, 0], [17, 0, 0]]
                self.evening_range = [[17, 0, 0], [21, 0, 0]]
                self.pre_midnight_range = [[21, 0, 0], [23, 0, 0]]
                self.post_midnight_range = [[4, 0, 0], [8, 0, 0]]

                self.increment_r = None
                self.increment_g = None
                self.increment_b = None
                self.increment_a = None

                self.s_increment_r = None
                self.s_increment_g = None
                self.s_increment_b = None
                self.s_increment_a = None

                self.color_set = False

                self.updating = False

                self.sun = shell_scene.objects['MainSun']

            def mirrorTime(self, time_system=None):

                if time_system:

                    if time_system.hour != self.hour or time_system.minute != self.minute or time_system.second != self.second:
                    
                        self.hour = time_system.hour
                        self.minute = time_system.minute
                        self.second = time_system.second

                        self.updating = time_system.updating

            def normalizeTimeRange(self, range=None):

                if range:

                    if range[1][0] < range[0][0]:

                        adjusted_range_max_hour = range[0][0] + ((24-range[0][0]) + range[1][0])
                        # print(adjusted_range_max_hour)
                        adjusted_range_package = [adjusted_range_max_hour, range[1][1], range[1][2]]

                        normalized_range_min = self.convertTimeToSeconds(range[0])[1]
                        normalized_range_max = self.convertTimeToSeconds(adjusted_range_package)[1]

                        return (normalized_range_min, normalized_range_max)
                    
                    else:

                        normalized_range_min = self.convertTimeToSeconds(range[0])[1]
                        normalized_range_max = self.convertTimeToSeconds(range[1])[1]

                        return (normalized_range_min, normalized_range_max)

            def convertTimeToSeconds(self, reference_time=None):

                time_in_seconds = self.second+(self.minute*60)+((self.hour*60)*60)
                reference_time_in_seconds = None

                if reference_time:

                    reference_time_in_seconds = ((reference_time[0]*60)*60)+(reference_time[1]*60)+reference_time[2]

                return(time_in_seconds, reference_time_in_seconds)
            
            def progressSky(self, target_color=[1.0, 1.0, 1.0, 1.0], target_time=[12, 0, 0]):

                current_color = self.color_controller.default_value
                current_time = [self.hour, self.minute, self.second]

                sun_data = self.sun.blenderObject.data

                sun_rotation_increment = 360/86400
                sun_absolute_rotation = (sun_rotation_increment*self.convertTimeToSeconds()[0])-180
                # print(math.radians(sun_absolute_rotation))
                self.sun.localOrientation = mathutils.Euler((math.radians(sun_absolute_rotation), self.sun.localOrientation.to_euler().y, self.sun.localOrientation.to_euler().z), "XYZ")
                # print(self.sun.localOrientation.to_euler())

                # if not self.color_set:

                #     self.active = True
                #     self.color_set = True

                if self.active:

                    self.proceed = True

                elif not self.active:

                    self.proceed = False

                if self.normalizeTimeRange(self.evening_range)[0] <= self.convertTimeToSeconds()[0] < self.normalizeTimeRange(self.evening_range)[1]:

                    self.progress_range_start = self.convertTimeToSeconds(self.evening_range[0])[1]
                    self.color_from = self.EVENING
                    self.color_to = self.NIGHT
                    self.sun_from = self.SUN_EVENING
                    self.sun_to = self.SUN_NIGHT
                    self.progress_range_finish = self.convertTimeToSeconds(self.evening_range[1])[1]
                    self.active = True
                    script_runner['lights_out'] = False

                elif self.normalizeTimeRange(self.pre_midnight_range)[0] <= self.convertTimeToSeconds()[0] < self.normalizeTimeRange(self.pre_midnight_range)[1]:

                    self.progress_range_start = self.normalizeTimeRange(self.pre_midnight_range)[0]
                    self.color_from = self.NIGHT
                    self.color_to = self.DEEP_NIGHT
                    self.sun_from = self.SUN_NIGHT
                    self.sun_to = self.SUN_DEEPNIGHT
                    self.progress_range_finish = self.convertTimeToSeconds(self.pre_midnight_range[1])[1]
                    self.active = True
                    script_runner['lights_out'] = False
                    # print(self.normalizeTimeRange(self.night_range)[1])

                elif self.normalizeTimeRange(self.post_midnight_range)[0] <= self.convertTimeToSeconds()[0] < self.normalizeTimeRange(self.post_midnight_range)[1]:

                    self.progress_range_start = self.normalizeTimeRange(self.post_midnight_range)[0]
                    self.color_from = self.DEEP_NIGHT
                    self.color_to = self.MORNING
                    self.sun_from = self.SUN_DEEPNIGHT
                    self.sun_to = self.SUN_MORNING
                    self.progress_range_finish = self.convertTimeToSeconds(self.post_midnight_range[1])[1]
                    self.active = True
                    script_runner['lights_out'] = False
                    # print(self.normalizeTimeRange(self.night_range)[1])

                elif self.normalizeTimeRange(self.morning_range)[0] <= self.convertTimeToSeconds()[0] < self.normalizeTimeRange(self.morning_range)[1]:

                    self.progress_range_start = self.convertTimeToSeconds(self.morning_range[0])[1]
                    self.color_from = self.MORNING
                    self.color_to = self.DAY
                    self.sun_from = self.SUN_MORNING
                    self.sun_to = self.SUN_DAY
                    self.progress_range_finish = self.convertTimeToSeconds(self.morning_range[1])[1]
                    self.active = True

                    if self.hour <= 8 and self.minute < 30:
                            
                        script_runner['lights_out'] = True

                elif self.normalizeTimeRange(self.day_range)[0] <= self.convertTimeToSeconds()[0] < self.normalizeTimeRange(self.day_range)[1]:

                    self.progress_range_start = self.convertTimeToSeconds(self.day_range[0])[1]
                    self.color_from = self.DAY
                    self.color_to = self.EVENING
                    self.sun_from = self.SUN_DAY
                    self.sun_to = self.SUN_EVENING
                    self.progress_range_finish = self.convertTimeToSeconds(self.day_range[1])[1]
                    self.active = True
                    script_runner['lights_out'] = True

                else:

                    self.active = False

                # if self.convertTimeToSeconds(self.evening_range[0])[1] <= self.convertTimeToSeconds()[0] < self.convertTimeToSeconds(self.evening_range[1])[1]:

                #     self.progress_range_start = self.convertTimeToSeconds(self.evening_range[0])[1]
                #     self.color_from = self.EVENING
                #     self.color_to = self.NIGHT
                #     self.progress_range_finish = self.convertTimeToSeconds(self.evening_range[1])[1]

                # if self.convertTimeToSeconds(self.night_range[0])[1] <= self.convertTimeToSeconds()[0] < self.convertTimeToSeconds(self.night_range[1])[1]:

                #     self.progress_range_start = self.convertTimeToSeconds(self.evening_range[0])[1]
                #     self.color_from = self.EVENING
                #     self.color_to = self.NIGHT
                #     self.progress_range_finish = self.convertTimeToSeconds(self.evening_range[1])[1]

                # if self.convertTimeToSeconds(self.evening_range[0])[1] <= self.convertTimeToSeconds()[0] < self.convertTimeToSeconds(self.evening_range[1])[1]:

                #     self.progress_range_start = self.convertTimeToSeconds(self.evening_range[0])[1]
                #     self.color_from = self.EVENING
                #     self.color_to = self.NIGHT
                #     self.progress_range_finish = self.convertTimeToSeconds(self.evening_range[1])[1]

                if self.proceed and self.updating:
                    
                    current_time_in_seconds = self.convertTimeToSeconds()[0]

                    color_range_r = self.color_to[0]-self.color_from[0]
                    color_range_g = self.color_to[1]-self.color_from[1]
                    color_range_b = self.color_to[2]-self.color_from[2]
                    color_range_a = self.color_to[3]-self.color_from[3]

                    sun_range_r = self.sun_to[0]-self.sun_from[0]
                    sun_range_g = self.sun_to[1]-self.sun_from[1]
                    sun_range_b = self.sun_to[2]-self.sun_from[2]

                    time_range = self.progress_range_finish-self.progress_range_start

                    self.increment_r = color_range_r/time_range
                    self.increment_g = color_range_g/time_range
                    self.increment_b = color_range_b/time_range
                    self.increment_a = color_range_a/time_range

                    self.s_increment_r = sun_range_r/time_range
                    self.s_increment_g = sun_range_g/time_range
                    self.s_increment_b = sun_range_b/time_range

                    self.color_controller.default_value[0] = self.color_from[0] + (self.increment_r*(current_time_in_seconds-self.progress_range_start))
                    self.color_controller.default_value[1] = self.color_from[1] + (self.increment_g*(current_time_in_seconds-self.progress_range_start))
                    self.color_controller.default_value[2] = self.color_from[2] + (self.increment_b*(current_time_in_seconds-self.progress_range_start))
                    self.color_controller.default_value[3] = self.color_from[3] + (self.increment_a*(current_time_in_seconds-self.progress_range_start))

                    self.cloud_color_controller.default_value = self.color_controller.default_value

                    sun_data.color = [(self.sun_from[0] + (self.s_increment_r*(current_time_in_seconds-self.progress_range_start))), (self.sun_from[1] + (self.s_increment_g*(current_time_in_seconds-self.progress_range_start))), (self.sun_from[2] + (self.s_increment_b*(current_time_in_seconds-self.progress_range_start)))]

                    self.updating = False

            class colorLibrary:

                def __init__(self, parent):

                    self.parent = parent
                    self.EVENING = [0.641, 0.661, 0.311, 1.0]
                    self.NIGHT = [0.676, 0.528, 0.017, 1.0]



                # if current_color != target_color:

                #     # current_color = self.color_controller.default_value
                    
                #     if current_time[0] <  target_time[0]:

                #         if target_color[0] > current_color[0]:
                        
                #             color_range = (target_color[0] - current_color[0])
                #             print("Color range: ",  color_range)

                #             if current_time[0] < target_time[0]:

                #                 time_range = (target_time[0] - start_time[0])*60
                #                 print("Time range: ", time_range)
                #                 self.increment_r = color_range/time_range
                #                 print("Increment: ", self.increment_r)

                #                 self.color_controller.default_value[0] = self.increment_r*((start_time[0]+self.hour)*60)
                #                 print(current_color[0])


            def updateState(self):

                if self.night_range[1] > self.hour > self.night_range[0]:

                    self.is_day = False
                    self.is_night = True

                if self.day_range[1] > self.hour > self.day_range[0]:

                    self.is_day = True
                    self.is_night = False

    class g7Tools:

        class gameDebugger:

            def __init__(self):

                self.frame_rate = bge.logic.getAverageFrameRate()
                self.framerate_visible = False
        
        class gameTimer:

            def __init__(self):

                self.start_hours = 0
                self.start_minutes = 0
                self.start_seconds = 0

                self.seconds = 0
                self.hours = 0
                self.minutes = 0

                self.running = False
                self.previous_tick = 0

                self.display_time = None
                self.separator = ":"

                self.cycle_count = 0

            def startTimer(self):

                if self.running == False:

                    self.previous_tick = bge.logic.getFrameTime()
                    self.seconds = self.start_seconds
                    self.minutes = self.start_minutes
                    self.hours = self.start_hours
                    # self.cycle_count = 1
                    self.running = True

            def stopTimer(self):

                if self.running == True:

                    self.seconds = self.start_seconds
                    self.minutes = self.start_minutes
                    self.hours = self.start_hours
                    self.cycle_count = 0
                    self.running = False

            def pauseTimer(self):

                if self.running:

                    self.running = False

            def unpauseTimer(self):

                if not self.running:

                    self.running = True

            def setTimer(self, start_hours=0, start_minutes=0, start_seconds=0):

                self.start_hours = start_hours
                self.start_minutes = start_minutes
                self.start_seconds = start_seconds

                if self.start_seconds >= 60:

                    self.start_minutes += int(self.start_seconds/60)
                    self.start_seconds = int(self.start_seconds%60)

                if self.start_minutes >= 60:

                    self.start_hours += int(self.start_minutes/60)
                    self.start_minutes = int(self.start_minutes%60)

                if self.start_hours >= 24:

                    self.start_hours = 23
                    self.start_minutes = 59
                    self.start_seconds = 59

            def updateState(self):

                if self.running:

                    if self.seconds == 59 and self.minutes == 59 and self.hours == 23 and self.cycle_count == 1:
                        
                        self.seconds = self.start_seconds
                        self.minutes = self.start_minutes
                        self.hours = self.start_hours
                        self.cycle_count = 0
                        self.running = False

                    current_time = bge.logic.getFrameTime()
                    
                    if current_time - self.previous_tick > 1.0:

                        self.seconds -= 1
                        self.cycle_count = 1
                        print(self.display_time)

                        if self.seconds < 0:

                            self.minutes -= 1
                            self.seconds = 59

                        if self.minutes < 0:

                            self.hours -= 1
                            self.minutes = 59

                        if self.hours < 0:

                            self.hours = 23

                        self.previous_tick = bge.logic.getFrameTime()

                    self.display_time = f'{self.hours}%s{self.minutes:02}%s{self.seconds:02}' % (self.separator, self.separator)

    class g7Ui:

        class gameButton:

            def __init__(self):

                self.size_x = 1.0
                self.size_y = 0.5
                self.is_image = True
                self.visible = True
                self.pressed = False
                self.hovered = False
                self.active = False

            def setAsImage(self, filepath):

                self.is_image = True
        
        class gameMenu:

            def __init__(self):

                self.item_count = 0
                self.item_spacing = 0.4
                self.items_are_images = True
                self.alignment = None
                self.visible = False
                self.active = False
                self.flag_noactivate = False

                self.ALIGN_LEFT = 0
                self.ALIGN_RIGHT = 1
                self.ALIGN_CENTER = 2

    class g7KeyMaps:

        def __init__(self):

            pass

        class dfKeyMap:

            def __init__(self, control_system):

                self.camera_rotate_left = bge.events.LEFTARROWKEY
                self.camera_rotate_right = bge.events.RIGHTARROWKEY
                self.camera_rotate_up = bge.events.UPARROWKEY
                self.camera_rotate_down = bge.events.DOWNARROWKEY
                self.camera_rotate_stick = control_system.gamepadRStick
                self.camera_linear_stick = control_system.gamepadLStick


shell_scene = bge.logic.getCurrentScene()
script_runner = bge.logic.getCurrentController().owner
script_runner_object = bpy.data.objects['Script Runner']

engine_framework = script_runner['engine']
framework_elements = script_runner['engine_elements']
framework_systems = script_runner['engine_systems']
framework_tools = script_runner['engine_tools']

asset_system = script_runner['asset_system']
audio_system = script_runner['audio_system']
cinematic_system = script_runner['cinematic_system']
control_system = script_runner['control_system']
parkour_system = script_runner['parkour_system']
time_system = script_runner['time_system']
world_system = script_runner['world_system']

collections_list = bpy.data.collections # create list of collections in memory

# shell_collection = collections_list['Scene Collection']

internal_main_collection = collections_list['Main Collection']

external_active_collection = collections_list['Imported Collection (Active)']
external_inactive_collection = collections_list['Imported Collection (Inactive)']

present_time = round(bge.logic.getFrameTime(), 3)

if script_runner['last_frame_time_set?'] == False:

    if present_time - script_runner['last_frame_time'] > 0:

        script_runner['frame_time_interval'] = present_time - script_runner['last_frame_time']
        script_runner['last_frame_time'] = round(bge.logic.getFrameTime(), 3)
        script_runner['last_frame_time_set?'] = True
        # print(script_runner['frame_time_interval'])
        script_runner['last_frame_time_set?'] = False

def gamePreliminaries():

    if script_runner['engine_set?'] == False:

        engine_framework = g7Engine() # define the engine object and initialize it
        framework_elements = engine_framework.elements # define the current engine's elements extension
        framework_systems = engine_framework.systems # define the current engine's systems extension
        framework_tools = engine_framework.tools

        script_runner['engine'] = engine_framework # embed engine into game runtime variable
        script_runner['engine_elements'] = framework_elements # embed engine elements into game runtime variable
        script_runner['engine_systems'] = framework_systems # embed engine systems into game runtime variable
        script_runner['engine_tools'] = framework_tools

        script_runner['timer_list'] = []

        script_runner['engine_set?'] = True

    if script_runner['systems_set?'] == False:
        
        asset_system = framework_systems.assetSystem() # define the current engine's asset system
        audio_system = framework_systems.audioSystem() # define the current engine's audio system
        cinematic_system = framework_systems.cinematicSystem() # define the current game's cinematic system
        control_system = framework_systems.controlSystem() # define the current game's control system
        parkour_system = framework_systems.parkourSystem(framework_elements)
        time_system = framework_systems.timeSystem() # define the current game's time system
        world_system = framework_systems.worldSystem()

        script_runner['asset_system'] = asset_system
        script_runner['audio_system'] = audio_system
        script_runner['cinematic_system'] = cinematic_system
        script_runner['control_system'] = control_system
        script_runner['parkour_system'] = parkour_system
        script_runner['time_system'] = time_system
        script_runner['world_system'] = world_system

        script_runner['systems_set?'] = True

    if script_runner['engine_set?'] == True and script_runner['systems_set?'] == True:

        script_runner['preliminaries_complete?'] = True
        script_runner['engine'].setCursorPosition()


def testingFunction():

    def rainBehavior(rain_drop):

        rain_velocity = random.uniform(-2.2, -1.2)
        rain_drop.applyMovement((0, 0, rain_velocity), True)
        # vect = rain_drop.getVectTo(shell_scene.active_camera)
        # rain_drop.alignAxisToVect(vect[1], 1, 1.0)
        # rain_drop.alignAxisToVect((0, 0, 1.0), 2, 1.0)
        # ray = rain_drop.rayCast(rain_drop.worldPosition, (rain_drop.worldPosition.x, rain_drop.worldPosition.y, rain_drop.worldPosition.z-1.0), 1.0)

        # rain_impact = shell_scene.objects['rain-impact']
        # # print(ray[1])

        # if ray[1]:

        #     rain_impact.worldPosition = ray[1]

    audio_threads = audio_system.threads

    audio_threads.music.playQueue(audio_threads.music)
    audio_threads.dialogue.playQueue(audio_threads.dialogue)
    world_system.progressSky()

    actuators = bge.logic.getCurrentController().actuators

    # if control_system.readQueue(control_system.gamepadStart, "gamepad") == control_system.TAP:

    #     if not script_runner['game_paused']:

    #         # print(actuators)
    #         target_actuator = actuators['P_Collection']

    #         # actuators['Collection'].mode = 0
    #         # actuators['Collection'].collection = external_inactive_collection
    #         target_actuator.active = True

    # audio_system.master_volume = 100
    # audio_system.music_volume = 100
    # audio_system.dialogue_volume = 100

    if script_runner['active_lib_stream_complete'] and script_runner['inactive_lib_stream_complete']:

        if 'test_timer' not in script_runner:
        
            script_runner['test_timer'] = framework_tools.gameTimer()
            script_runner['test_timer'].setTimer(0, 0, 5)
            script_runner['test_timer'].startTimer()

        if 'test_timer' in script_runner:
            
            test_timer = script_runner['test_timer']
            test_timer.updateState()
            # print(test_timer.display_time)

            if control_system.gamepadY in control_system.gamepad_just_activated:

                test_timer.startTimer()

            if test_timer.running == False:

                # test_timer.setTimer(0, 70, 0)
                # test_timer.startTimer()
                pass

            # if control_system.gamepadX in control_system.gamepad_just_activated:

            #     print(asset_system.listLibraries())

        if cinematic_system.target_camera == None:

            # cinematic_system.target_camera = "Game Visualizer"
            cinematic_system.target_camera = script_runner['engine_elements'].gameCamera(script_runner['engine_elements'], "Game Visualizer", 0, "Game Visualizer", "Visualizer Pivot")

        if cinematic_system.target_camera.name == "Game Visualizer" and cinematic_system.target_camera.name in shell_scene.objects:

            cinematic_system.target_camera.setPivot()
            cinematic_system.target_camera.updateState()
            pivot = cinematic_system.target_camera.pivot
            pivot.camera = cinematic_system.target_camera
            pivot.freeMovement()
            
            # if pivot.track_target:

            #     vector = pivot.object.getVectTo(pivot.track_target)
            #     pivot.object.alignAxisToVect(vector[1], 1, 0.1)
            #     pivot.object.alignAxisToVect((0, 0, 1.0), 2, 0.5)

            if  not pivot.calibrated:

                pivot.chainToTarget("Chain Target - Camera")

            if control_system.readQueue(control_system.gamepadBack, "gamepad") == control_system.TAP:

                if pivot.track_target != shell_scene.objects["Cubess"]:

                    pivot.chainToTarget("Cubess")

                elif pivot.track_target != shell_scene.objects["Chain Target - Camera"]:

                    pivot.chainToTarget("Chain Target - Camera")

            pivot.updateState()
            # pivot_class = framework_elements.gameCameraPivot(pivot)
            # pivot_class.freeMovement()

        control_system.updateState()
        # control_system.getActiveButtons()
        cinematic_system.updateState()

        time_system.updateState()
        asset_system.updateState()

        script_runner['display_time'] = time_system.display_time
        # time_system.changeSpeed(100.0)

        # scene_world = bpy.data.scenes[0].world
        # print(scene_world.color)
        # print(scene_world.node_tree.nodes['World BackGround'].inputs['Color'])
        # scene_world.node_tree.nodes['World BackGround'].inputs['Color'].default_value = [0, 1, 0, 1]
        # print(bpy.data.worlds["World.001"].node_tree.nodes["World BackGround"].inputs[0].default_value[0])

        # if control_system.active_gamepads:

        #     if control_system.gamepadA in control_system.gamepad_just_activated:

        #         control_system.activateVibration(control_system.vibrateTemplateTest)
        #         # manager = pyglet.input.ControllerManager()
        #         controllers = pyglet.input.get_controllers()

        #         if controllers:

        #             con = controllers[0]
        #             # con.close()

        #             # if not con.open():

        #             #     con.open()

        #             con.rumble_play_weak(1.0, duration=0.0)
        #             con.rumble_play_strong(1.0, duration=0.0)

        #     # if control_system.gamepadLTrigger in control_system.activeGamepadInputs:

        #     #     print(control_system.gamepadLStickValue)

        if control_system.gamepadDUp in control_system.gamepad_just_activated and audio_system.master_volume < 100:

            audio_system.master_volume += 1
            print(audio_system.master_volume)

        if control_system.gamepadDDown in control_system.gamepad_just_activated and audio_system.master_volume > 0:

            audio_system.master_volume -= 1
            print(audio_system.master_volume)

        # print(time_system.display_time)
        world_system.mirrorTime(time_system)

        # if script_runner['engine_elements'].fetchEntity("character", 0):
        
        #     print(script_runner['engine_elements'].fetchEntity("character", 0).name)


        if "FleeFolk" in shell_scene.objects:

            if 2 not in script_runner['engine_elements'].active_character_ids:

                flee = shell_scene.objects['FleeFolk']
                flee_character = script_runner['engine_elements'].gameCharacter(script_runner['engine_elements'], "FleeFolker", 2, flee, flee)

            if 2 in script_runner['engine_elements'].active_character_ids:

                flee_character = script_runner['engine_elements'].fetchEntity("character", 2)

                charobj = flee_character.object
                ray = flee_character.object.rayCastTo((charobj.worldPosition.x, charobj.worldPosition.y, charobj.worldPosition.z-1.0), 0.2)

                if ray:

                    flee_character.fleeTarget(shell_scene.objects["Character Size Reference - 21"], 15.0)
                    flee_character.followTarget(shell_scene.objects["Character Size Reference - 21"], 5.0, -20.0)
                    # pass
        
        if "Character Size Reference - 21" in shell_scene.objects:

            if 0 not in script_runner['engine_elements'].active_character_ids:

                test = shell_scene.objects["Character Size Reference - 21"]
                test_character = script_runner['engine_elements'].gameCharacter(script_runner['engine_elements'], "Tester", 0, test, test)
                
                for child in test_character.object.children:

                    if 'parkour_prober' in child:

                        test_character.parkour_probe = child

                    if 'prober_helper' in child:

                        test_character.parkour_probe_helper = child

                print("Generated a character object!")

            if 0 in script_runner['engine_elements'].active_character_ids:
                
                test_character = script_runner['engine_elements'].fetchEntity("character", 0)
                # test_character = test_character.getMemoryObject()
                charobj = test_character.object
                camera_chain_target = charobj.children['Chain Target - Camera']
                freefall_track_target = camera_chain_target.children['Freefall Track Target']
                camera_pivot = cinematic_system.target_camera.pivot.object
                # charobj['jump'] = False
                maximum_speed = 25.0
                maximum_spin = 6.0
                maximum_angV = 1.0
                # ray = test_character.object.rayCastTo((charobj.worldPosition.x, charobj.worldPosition.y, charobj.worldPosition.z-1.0), 0.4)
                vector_to_camera = charobj.getVectTo(shell_scene.active_camera)
                vector_freefall_look = camera_pivot.getVectTo(freefall_track_target)
                ray = charobj.sensors['main_collider'].positive
                # radar = charobj.sensors['parkour_radar']
                local_map = test_character.local_parkour_map
                # local_map = parkour_system.analyzeSurroundings(test_character)
                reference_parkour_seek_range = 8.0
                # print(radar.hitObjectList)
                test_character.on_ground = ray
                statistics = test_character.map_analysis
                test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)
                axis_vect_y = test_character.physics_controller.getAxisVect((0.0, 1.0, 0.0))
                v_child_init_pos = mathutils.Vector((-5.0, -10, 10))
                parent_matrix = charobj.worldTransform
                new_position = parent_matrix @ v_child_init_pos
                
                # bge.render.drawLine(charobj.worldPosition, new_position, (0.5, 0.0, 1.0))

                # if len(script_runner['asset_system'].spawn_points_unnacounted_outside_proximity) > 0:

                #     print(script_runner['asset_system'].spawn_points_unnacounted_outside_proximity)
                # position = test_character.object.worldPosition
                # orientation = test_character.object.worldOrientation
                # vec2 = orientation[1]
                # vec = position+vec2
                # vec.magnitude = 5
                # axis_vect_y = vec
                # print(axis_vect_y)
                # bge.render.drawLine(test_character.object.worldPosition, axis_vect_y, (0.5, 0.0, 1.0))

                # print(local_map)
                # print(test_character.is_driver)

                rate = script_runner['rate']
                particle_count = rate*30

                if script_runner['control_system'].gamepadLButton in control_system.gamepad_just_activated:

                    script_runner['rate'] += 1

                if script_runner['control_system'].gamepadRButton in control_system.gamepad_just_activated and script_runner['rate'] > 0:

                    script_runner['rate'] -= 1

                # RAIN SYSTEM using ADDOBJECT

                # if bge.logic.getFrameTime() - script_runner['weather_timer'] > script_runner['weather_interval']:
                
                #     for i in range(rate):

                #         charsy = test_character.physics_controller
                #         charsy_pos = charsy.worldPosition

                #         x_limits = 15.0
                #         y_limits = 15.0
                #         z_clamp = charsy_pos.z + 20.0

                #         random_x = random.uniform(charsy_pos.x - x_limits, charsy_pos.x + x_limits)
                #         random_y = random.uniform(charsy_pos.y - y_limits, charsy_pos.y + y_limits)

                #         generated_pos = (random_x, random_y, z_clamp)

                #         rain_positioner = shell_scene.objects['rain_positioner']

                #         rain_positioner.worldPosition = generated_pos
                    
                #         if 'rain_drop_blox' in shell_scene.objectsInactive:

                #             rain_blok = shell_scene.objectsInactive['rain_drop_blox']

                #             rain_drop = shell_scene.addObject(rain_blok, rain_positioner, 120, False)

                # else:

                #     script_runner['weather_timer'] = bge.logic.getFrameTime()


                # RAIN SYSTEM using PRE LOADED DROPS
                
                if len(script_runner['engine'].rain_drops) < particle_count:
                
                    for i in range(particle_count):

                        rain_blok = shell_scene.objectsInactive['rain_drop_blox']
                        rain_drop = shell_scene.addObject(rain_blok, script_runner, 0, False)
                        script_runner['engine'].rain_drops.append(rain_drop)
                        # print(i)

                        if len(script_runner['engine'].rain_drops) == particle_count:

                            break

                elif len(script_runner['engine'].rain_drops) > particle_count:

                    for rain_drop in script_runner['engine'].rain_drops:

                        # print(script_runner['engine'].rain_drops.index(rain_drop))

                        if script_runner['engine'].rain_drops.index(rain_drop) - 1 > particle_count:

                            script_runner['engine'].rain_drops.remove(rain_drop)
                            rain_drop.endObject()



                    last_item_index = len(script_runner['engine'].rain_drops) - 1

                    del_target = script_runner['engine'].rain_drops[last_item_index]
                    
                    script_runner['engine'].rain_drops[last_item_index].endObject()
                    script_runner['engine'].rain_drops.remove(del_target)

                elif len(script_runner['engine'].rain_drops) == particle_count:

                # else:

                    # print(len(script_runner['engine'].rain_drops), particle_count)
                
                    if bge.logic.getFrameTime() - script_runner['weather_timer'] > script_runner['weather_interval']:

                        charsy = test_character.physics_controller
                        charsy_pos = charsy.worldPosition
                        rain_drops_bt = [rain_drop for rain_drop in script_runner['engine'].rain_drops if rain_drop.worldPosition.z < charsy_pos.z - 20.0]

                        # for rain_drop in script_runner['engine'].rain_drops:

                        #     rain_drop.applyMovement((0, 0, -0.80), True)
                        #     vect = rain_drop.getVectTo(shell_scene.active_camera)
                        #     rain_drop.alignAxisToVect(vect[1], 1, 1.0)
                        #     rain_drop.alignAxisToVect((0, 0, 1.0), 2, 1.0)

                        rainMap = list(map(rainBehavior, script_runner['engine'].rain_drops))
                        
                        for i in range(rate):
                        
                            charsy = test_character.physics_controller
                            charsy_pos = charsy.worldPosition

                            x_limits = 15.0
                            y_limits = 15.0
                            z_clamp = charsy_pos.z + 20.0

                            random_x = random.uniform(charsy_pos.x - x_limits, charsy_pos.x + x_limits)
                            random_y = random.uniform(charsy_pos.y - y_limits, charsy_pos.y + y_limits)

                            generated_pos = (random_x, random_y, z_clamp)
                            # bge.render.drawLine(charsy_pos, generated_pos, (0.5, 0.0, 1.0))

                            rain_positioner = shell_scene.objects['rain_positioner']

                            rain_positioner.worldPosition = generated_pos

                            if len(rain_drops_bt) > 0:

                                rain_drop = rain_drops_bt[0]
                                rain_drop.worldPosition = generated_pos
                                rain_drops_bt.remove(rain_drop)

                            # for rain_drop in rain_drops_bt:

                            #     if rain_drop.worldPosition.z < charsy_pos.z - 20.0:

                            #         rain_drop.worldPosition = generated_pos
                            #         # print(":P")
                            #         break

                            # print(generated_pos)

                            # bge.render.drawLine(charsy_pos, generated_pos, (0.5, 0.0, 1.0))

                            # if 'rain_drop_blox' in shell_scene.objectsInactive:

                            #     rain_blok = shell_scene.objectsInactive['rain_drop_blox']

                            #     rain_drop = shell_scene.addObject(rain_blok, rain_positioner, 0, False)

                        else:

                            script_runner['weather_timer'] = bge.logic.getFrameTime()

                # for i in range(50):

                #     print(random.uniform(0,5))

                if not test_character.is_driver:

                    pivot.chainToTarget("Chain Target - Camera")
                    # print(pivot.object.localOrientation)
                    # pivot.object.alignAxisToVect(axis_vect_y, 1, 0.1)
                    # pivot.object.alignAxisToVect((0, 0, 1.0), 2, 0.4)

                    if test_character:

                        test_character.local_parkour_map = parkour_system.analyzeSurroundings(test_character)
                        # print(local_map)

                    if local_map:

                        test_character.map_analysis = parkour_system.analyzeParkourPoint(test_character, local_map[1])

                        if control_system.gamepadRTrigger in control_system.activeGamepadInputs: # and control_system.gamepadX in control_system.activeGamepadInputs:

                            # test_character.physics_controller.setLinearVelocity(statistics[2]*40, False)
                            # if local_map[1] in radar.hitObjectList:
                            
                            parkour_system.jumpToPoint(test_character, statistics)

                        # print(statistics)

                    # print(local_map)
                    # print(ray)
                            
                if control_system.gamepadRTrigger in control_system.activeGamepadInputs:

                    test_character.tracking_sensitivity = 0.85

                elif control_system.gamepadRTrigger not in control_system.activeGamepadInputs:

                    test_character.tracking_sensitivity = 0.5
                    test_character.run_parkour = False

                if test_character.targeting:

                    test_character.lookAtTarget(test_character.looking_target)
                    cinematic_system.target_camera.pivot.lookAtObject(test_character.looking_target)

                if control_system.readQueue(control_system.gamepadRStickButton, "gamepad") == control_system.TAP:

                    if not test_character.targeting:

                        nearest_entities = script_runner['engine_elements'].peruseNearbyObjects(test_character, 50.0)
                        nearest_entities_list = nearest_entities[0]
                        print(nearest_entities)

                        for entity in nearest_entities_list:

                            # print(entity[0].name)

                            if "target_possible" in entity[0]:

                                print(entity[0])

                                if script_runner['engine_elements'].objectInFrame(entity[0]):

                                    test_character.lookAtTarget(entity[0])
                                    test_character.looking_target = entity[0]
                                    test_character.targeting = True

                    elif test_character.targeting:

                        test_character.looking_target = None
                        test_character.targeting = False

                if control_system.gamepadX in control_system.activeGamepadInputs:

                    nearby = script_runner['engine_elements'].peruseNearbyEntities(test_character, 50.0)

                    if nearby:

                        print(nearby[1].name)

                # if ray:
                    
                    # if control_system.gamepadRTrigger in control_system.activeGamepadInputs:

                    #     test_character.followTarget(shell_scene.objects['Cubes'])

                    # elif control_system.gamepadLTrigger in control_system.activeGamepadInputs:

                    #     test_character.lookAtTarget(shell_scene.objects['Cubes'])

                if control_system.readQueue(control_system.gamepadY, "gamepad") == control_system.TAP:
                    
                    if test_character.is_driver:

                        test_character.requesting_exit = True

                    elif not test_character.is_driver and ray:

                        test_character.requesting_entrance = True

                elif not control_system.gamepadY in control_system.activeGamepadInputs:

                    test_character.requesting_entrance = False
                    test_character.requesting_exit = False

                # print(charobj.getLinearVelocity(True)[1])

                test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)
                
                # if charobj.getLinearVelocity(True)[2] < -5.0:

                #     camera_pivot.alignAxisToVect((vector_freefall_look[1]), 1, 0.02)
                #     camera_pivot.alignAxisToVect((0, 0, 1.0), 2, 0.02)

                if not ray: # if the raycast can't detect any objects

                    charobj['jump'] = True # register the character as jumping

                    if charobj['jump'] == True:

                        if control_system.gamepadLStick in control_system.activeGamepadInputs:

                            # charobj.applyImpulse(charobj.worldPosition, (0, 0.4*control_system.gamepadLStickValue[1], 0), True)
                            pass

                if ray and charobj['jump'] == False and not test_character.is_driver:

                    if not test_character.targeting:
                
                        if bge.events.WKEY in control_system.activeKeyboardInputs:
                        
                            if ray:
                            
                                test_character.setMovement(-maximum_speed, 1)

                            if not ray:

                                charobj.applyImpulse(charobj.worldPosition, (0, -0.1, 0), True)
                            
                            test_character.physics_controller.alignAxisToVect((vector_to_camera[1]), 1, 0.2)
                            test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)

                        if bge.events.SKEY in control_system.activeKeyboardInputs:
                        
                            if ray:
                            
                                test_character.setMovement(-maximum_speed, 1)

                            if not ray:

                                charobj.applyImpulse(charobj.worldPosition, (0, -0.1, 0), True)
                                
                            test_character.physics_controller.alignAxisToVect((-vector_to_camera[1]), 1, 0.2)
                            test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)

                        if bge.events.AKEY in control_system.activeKeyboardInputs:

                            # test_character.setRotation(-maximum_spin, 2)
                            test_character.setMovement(-maximum_speed, 1)
                            test_character.physics_controller.alignAxisToVect((vector_to_camera[1]), 0, 0.2)
                            test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)


                        if bge.events.DKEY in control_system.activeKeyboardInputs:

                            # test_character.setRotation(maximum_spin, 2)
                            test_character.setMovement(-maximum_speed, 1)
                            test_character.physics_controller.alignAxisToVect((-vector_to_camera[1]), 0, 0.2)
                            test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)

                        if bge.events.LEFTSHIFTKEY in control_system.activeKeyboardInputs:

                            test_character.setMovement(-abs(maximum_speed*1.5), 1)

                        if bge.events.SPACEKEY in control_system.activeKeyboardInputs and ray:

                            # charobj['jump'] = True
                            print(charobj.blenderObject.dimensions)
                            chardiagram = charobj.blenderObject.dimensions
                            impulse_location = (charobj.worldPosition.x+(chardiagram[0]/2), charobj.worldPosition.y+(chardiagram[1]/2), charobj.worldPosition.z+(chardiagram[2]/2))
                            # charobj.applyImpulse(charobj.worldPosition, (0, 0, 6.0), True)
                            charobj.applyImpulse(impulse_location, (0, 60.0, 0.0), True)

                        # if bge.events.SPACEKEY not in control_system.activeKeyboardInputs and ray:

                        #     charobj['jump'] = False

                        if control_system.gamepadLStick in control_system.activeGamepadInputs:

                            if ray and charobj['jump'] == False:

                                movement_threshold = 0.4
                                tracking_speed_value = test_character.tracking_sensitivity
                            
                                # if control_system.gamepadRTrigger not in control_system.activeGamepadInputs:

                                if test_character.on_ground:
                                
                                    if abs(control_system.gamepadLStickValue[0]) > abs(control_system.gamepadLStickValue[1]) and abs(control_system.gamepadLStickValue[0]) > movement_threshold:

                                        test_character.setMovement(maximum_speed*-abs(control_system.gamepadLStickValue[0]), 1)

                                    elif abs(control_system.gamepadLStickValue[0]) < abs(control_system.gamepadLStickValue[1]) and abs(control_system.gamepadLStickValue[1]) > movement_threshold:

                                        test_character.setMovement(-abs(maximum_speed*control_system.gamepadLStickValue[1]), 1)

                                    if control_system.gamepadB in control_system.activeGamepadInputs:

                                        if not test_character.run_parkour:
                                            
                                            test_character.setMovement(-abs(maximum_speed*1.8), 1)

                                        test_character.parkour_seek_range = reference_parkour_seek_range*2.0
                                        test_character.minimum_parkour_range = reference_parkour_seek_range*0.4
                                        test_character.maximum_parkour_range = test_character.parkour_seek_range
                                        test_character.seek_banner = 0.3
                                        test_character.parkour_leap_speed = 5.0

                                        pivot = cinematic_system.target_camera.pivot
                                        pivot.trackToCameraTarget()
                                    
                                    elif control_system.gamepadB not in control_system.activeGamepadInputs:

                                        test_character.parkour_seek_range = reference_parkour_seek_range*1.0
                                        test_character.minimum_parkour_range = 0.0
                                        test_character.maximum_parkour_range = test_character.parkour_seek_range
                                        test_character.seek_banner = 0.7
                                        test_character.parkour_leap_speed = 8.0
                                    
                                    # test_character.setMovement(-abs(maximum_speed*(abs(control_system.gamepadLStickValue[1])+abs(control_system.gamepadLStickValue[0]))), 1)
                                    # print(-abs((maximum_speed*control_system.gamepadLStickValue[1])+(maximum_speed*control_system.gamepadLStickValue[0])))
                                    # print(-abs(maximum_speed*(abs(control_system.gamepadLStickValue[1])+abs(control_system.gamepadLStickValue[0]))))
                                    # print(charobj.getLinearVelocity(True)[1])

                                
                            if control_system.gamepadLStickValue[1] > 0:
                            
                                test_character.physics_controller.alignAxisToVect((-vector_to_camera[1]), 1, tracking_speed_value*abs(control_system.gamepadLStickValue[1]))

                            if control_system.gamepadLStickValue[1] < 0:
                            
                                test_character.physics_controller.alignAxisToVect((vector_to_camera[1]), 1, tracking_speed_value*abs(control_system.gamepadLStickValue[1]))

                            if control_system.gamepadLStickValue[0] > 0:

                                test_character.physics_controller.alignAxisToVect((-vector_to_camera[1]), 0, tracking_speed_value*abs(control_system.gamepadLStickValue[0]))

                                if control_system.gamepadLStickValue[0] > 0.5:

                                    # camera_pivot.setAngularVelocity((0, 0, -maximum_angV), False)
                                    pass

                            if control_system.gamepadLStickValue[0] < 0:

                                test_character.physics_controller.alignAxisToVect((vector_to_camera[1]), 0, 0.2*abs(control_system.gamepadLStickValue[0]))

                                if control_system.gamepadLStickValue[0] < -0.5:

                                    # camera_pivot.setAngularVelocity((0, 0, maximum_angV), False)
                                    pass

                            test_character.physics_controller.alignAxisToVect((0, 0, 1.0), 2, 1.0)
                            test_character.setRotation(maximum_spin*-control_system.gamepadLStickValue[0], 2)

                    if test_character.targeting:

                        if control_system.gamepadLStick in control_system.activeGamepadInputs:

                            if ray and charobj['jump'] == False:

                                test_character.setMovement(-maximum_speed*control_system.gamepadLStickValue[0], 0)

                                test_character.setMovement(maximum_speed*control_system.gamepadLStickValue[1], 1)
                            
                                # if abs(control_system.gamepadLStickValue[0]) > abs(control_system.gamepadLStickValue[1]):

                                #     test_character.setMovement(maximum_speed*-abs(control_system.gamepadLStickValue[0]), 1)

                                # elif abs(control_system.gamepadLStickValue[0]) < abs(control_system.gamepadLStickValue[1]):

                                #     test_character.setMovement(-abs(maximum_speed*control_system.gamepadLStickValue[1]), 1)

                                if control_system.gamepadB in control_system.activeGamepadInputs:

                                    test_character.setMovement(-abs(maximum_speed*1.5), 1)

                if control_system.gamepadA in control_system.activeGamepadInputs and ray:

                    charobj['jump'] = True
                    charobj.disableRigidBody()
                    charobj.applyImpulse(charobj.worldPosition, (0, 0, 60.0), True)

                if control_system.gamepadA not in control_system.activeGamepadInputs and bge.events.SPACEKEY not in control_system.activeKeyboardInputs and ray:

                    charobj['jump'] = False
                    charobj.enableRigidBody()

        if control_system.readQueue(control_system.gamepadDLeft, "gamepad") == control_system.TAP:

            time_system.hour -= 1

        if control_system.readQueue(control_system.gamepadDRight, "gamepad") == control_system.TAP:

            time_system.hour += 1

        # nfn = engine_framework.elements.gameCharacter(framework_elements, "949", 0)
        # print(len(framework_elements.instances))
        # framework_elements.activateEntities()
        # lib_path = bge.logic.expandPath('//data/libraries/')
        # false_path = bge.logic.expandPath('//data/libraries/false.blend')
        # audio_path = bge.logic.expandPath("//data/audio/")

        # for x in script_runner['engine_elements'].active_vehicle_ids:

        #     value = script_runner['engine_elements'].fetchEntity("vehicle", x)
        #     print(value.name, value.id)

        if "lady - blackmark - v1" in shell_scene.objects:

            # print(shell_scene.objects['lady - blackmark - v1'].children)

            if 2 not in script_runner["engine_elements"].active_vehicle_ids:
        
                lady_car = script_runner['engine_elements'].gameVehicle(script_runner['engine_elements'], "Cubisty", 2, shell_scene.objects["lady - blackmark - v1"], shell_scene.objects['lady - blackmark - v1'], ["tire - blackmark - v1.1", "tire - blackmark - v1.002", "tire - blackmark - v1.003", "tire - blackmark - v1.004"], script_runner['engine_elements'].VEHICLE_LADYBM_VONE)

            if 2 in script_runner['engine_elements'].active_vehicle_ids:

                lady_car = script_runner['engine_elements'].fetchEntity("vehicle", 2)
                lady_car.probeForDrivers()
                lady_car.calculateSpeed()
                # print(lady_car.enter_range)
                # cube_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                # print(control_system.gamepadRTriggerValue)
                # cube_car.accelerateVehicle()

                if lady_car.has_driver:

                    # print(cube_car.current_steering)
                    pivot.chainToTarget("xlink")

                    if control_system.gamepadRStick not in control_system.activeGamepadInputs:

                        if lady_car.mph > 5.0:
                        
                            pivot = cinematic_system.target_camera.pivot
                            pivot.setTrackingTimer()
                            pivot.trackToCameraTarget()
                            lady_car.initialized_driving = True

                        elif lady_car.mph < -15.0:

                            pivot = cinematic_system.target_camera.pivot
                            pivot.setTrackingTimer()
                            pivot.trackToCameraTarget(-1.0)
                            lady_car.initialized_driving = True

                        elif not lady_car.initialized_driving:

                            pivot = cinematic_system.target_camera.pivot
                            pivot.setTrackingTimer()
                            pivot.trackToCameraTarget()

                        else:

                            pivot = cinematic_system.target_camera.pivot
                            pivot.pauseTracking()

                    if control_system.gamepadRStick in control_system.activeGamepadInputs:

                        pivot = cinematic_system.target_camera.pivot
                        pivot.pauseTracking()
                        lady_car.initialized_driving = True

                    if control_system.gamepadRTrigger in control_system.activeGamepadInputs:

                        lady_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                        # print("A")

                    if control_system.gamepadLTrigger in control_system.activeGamepadInputs:

                        lady_car.reverseVehicle(control_system.gamepadLTriggerValue)
                        # print("R")

                    if control_system.gamepadLStick in control_system.activeGamepadInputs:

                        lady_car.steerVehicle(-control_system.gamepadLStickValue[0])

                    if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                        lady_car.realignSteering()
                        # print("NS")

                    if control_system.gamepadRTrigger not in control_system.activeGamepadInputs and control_system.gamepadLTrigger not in control_system.activeGamepadInputs:

                        lady_car.idleVehicle(0)
                        # print("NE")

                    # if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                    #     # cube_car.idleVehicle(1)
                    #     print("NS")

                    if control_system.gamepadRButton in control_system.activeGamepadInputs:

                        lady_car.brakeVehicle(0.01)

                    if control_system.gamepadRButton not in control_system.activeGamepadInputs:

                        lady_car.idleVehicle(2)

                elif not lady_car.has_driver:

                    lady_car.idleVehicle(0)
                    lady_car.idleVehicle(1)
                    # lady_car.idleVehicle(2)
                    lady_car.idleVehicle(3)

                    lady_car.initialized_driving = False

        if "Cubess" in shell_scene.objects:

            if 0 not in script_runner["engine_elements"].active_vehicle_ids:
        
                cube_car = script_runner['engine_elements'].gameVehicle(script_runner['engine_elements'], "Cubist", 0, shell_scene.objects["Cubess"], shell_scene.objects['Cubess'], ["cubes 1", "cubes 2", "cubes 3", "cubes 4"])

            if 0 in script_runner['engine_elements'].active_vehicle_ids:

                cube_car = script_runner['engine_elements'].fetchEntity("vehicle", 0)
                cube_car.probeForDrivers()
                # cube_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                # print(control_system.gamepadRTriggerValue)
                # cube_car.accelerateVehicle()

                if cube_car.has_driver:

                    # print(cube_car.current_steering)
                    pivot.chainToTarget("chain target - tester vehicle")

                    if control_system.gamepadRStick not in control_system.activeGamepadInputs:
                        
                        pivot = cinematic_system.target_camera.pivot
                        pivot.setTrackingTimer()
                        pivot.trackToCameraTarget()

                    if control_system.gamepadRStick in control_system.activeGamepadInputs:

                        pivot = cinematic_system.target_camera.pivot
                        pivot.pauseTracking()

                    if control_system.gamepadRTrigger in control_system.activeGamepadInputs:

                        cube_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                        print("A")

                    if control_system.gamepadLTrigger in control_system.activeGamepadInputs:

                        cube_car.reverseVehicle(control_system.gamepadLTriggerValue)
                        print("R")

                    if control_system.gamepadLStick in control_system.activeGamepadInputs:

                        cube_car.steerVehicle(-control_system.gamepadLStickValue[0])

                    if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                        cube_car.realignSteering()
                        print("NS")

                    if control_system.gamepadRTrigger not in control_system.activeGamepadInputs and control_system.gamepadLTrigger not in control_system.activeGamepadInputs:

                        cube_car.idleVehicle(0)
                        print("NE")

                    # if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                    #     # cube_car.idleVehicle(1)
                    #     print("NS")

                    if control_system.gamepadRButton in control_system.activeGamepadInputs:

                        cube_car.brakeVehicle(0.01)

                    if control_system.gamepadRButton not in control_system.activeGamepadInputs:

                        cube_car.idleVehicle(2)

                elif not cube_car.has_driver:

                    cube_car.idleVehicle(0)
                    cube_car.idleVehicle(1)
                    cube_car.idleVehicle(2)
        
        if "Cubes" in shell_scene.objects:

            if 1 not in script_runner["engine_elements"].active_vehicle_ids:
        
                cube_car = script_runner['engine_elements'].gameVehicle(script_runner['engine_elements'], "Dubist", 1, shell_scene.objects["Cubes"], shell_scene.objects['Cubes'], ["cube 1", "cube 2", "cube 3", "cube 4", "cube 5", "cube 6",])

            if 1 in script_runner['engine_elements'].active_vehicle_ids:

                cube_car = script_runner['engine_elements'].fetchEntity("vehicle", 1)
                cube_car.probeForDrivers()
                # cube_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                # print(control_system.gamepadRTriggerValue)
                # cube_car.accelerateVehicle()

                if cube_car.has_driver:

                    # print(cube_car.current_steering)
                    pivot.chainToTarget("chain target - tester vehicle 3")

                    if control_system.gamepadRStick not in control_system.activeGamepadInputs:
                        
                        pivot = cinematic_system.target_camera.pivot
                        pivot.setTrackingTimer()
                        pivot.trackToCameraTarget()

                    if control_system.gamepadRStick in control_system.activeGamepadInputs:

                        pivot = cinematic_system.target_camera.pivot            
                        pivot.pauseTracking()        

                    if control_system.gamepadRTrigger in control_system.activeGamepadInputs:

                        cube_car.accelerateVehicle(control_system.gamepadRTriggerValue)
                        print("A")

                    if control_system.gamepadLTrigger in control_system.activeGamepadInputs:

                        cube_car.reverseVehicle(control_system.gamepadLTriggerValue)
                        print("R")

                    if control_system.gamepadLStick in control_system.activeGamepadInputs:

                        cube_car.steerVehicle(-control_system.gamepadLStickValue[0])

                    if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                        cube_car.realignSteering()
                        print("NS")

                    if control_system.gamepadRTrigger not in control_system.activeGamepadInputs and control_system.gamepadLTrigger not in control_system.activeGamepadInputs:

                        cube_car.idleVehicle(0)
                        print("NE")

                    # if control_system.gamepadLStick not in control_system.activeGamepadInputs:

                    #     # cube_car.idleVehicle(1)
                    #     print("NS")

                    if control_system.gamepadRButton in control_system.activeGamepadInputs:

                        cube_car.brakeVehicle(0.01)

                    if control_system.gamepadRButton not in control_system.activeGamepadInputs:

                        cube_car.idleVehicle(2)

                elif not cube_car.has_driver:

                    cube_car.idleVehicle(0)
                    cube_car.idleVehicle(1)
                    cube_car.idleVehicle(2)
            
            # if cube_car.assembled == False:
            
            #     cube_car.assembleVehicle()
            #     print(cube_car.object.worldPosition)
            #     cube_car.assembled = True


    lib_1 = "lib.blend"
    lib_2 = "character-lib.blend"
    # lib_3 = "light-spawner-test-2.blend"
    lib_3 = "sdc-test.blend"
    lib_4 = "asset-design-1.blend"
    lib_5 = "tpc.blend"
    lib_6 = "lights.blend"
    lib_7 = "test-vehicle-3.blend"
    lib_8 = "test-vehicle.blend"
    lib_9 = "second-character.blend"
    lib_10 = "boxes.blend"
    lib_11 = "lady-blackmark-v1-test.blend"
    lib_12 = "animation-testing.blend"
    audio_1 = "Manu Shrine - Wave Form.mp3"
    audio_2 = "deffyme - Hallway.mp3"
    audio_3 = "string gol.wav"
    audio_4 = 'trenchcoat-nun - loop02.wav'
    audio_5 = 'moonlove - loop01.mp3'
    audio_6 = "Sleep with Rain & Thunder Sounds Tonight  Help Study, PTSD, Insomnia & Tinnitus VDownloader.wav"
    audio_7 = "test-01.wav"
    audio_8 = "test-02.wav"
    audio_9 = "test-03.wav"
    audio_10 = "test-04.wav"
    audio_11 = "test-12.wav"
    audio_12 = "test-13.wav"
    audio_13 = "test-14.wav"
    audio_14 = "rain - city environment - 01.ogg"
    audio_15 = "IMP 250 Seat Hall - Left Stage.wv"
    audio_16 = "bell - seclusion.ogg"

    audio_threads.music.updateState()
    audio_threads.dialogue.updateState()

    lib_path = bge.logic.expandPath('//data/libraries/')
    false_path = bge.logic.expandPath('//data/libraries/false.blend')
    audio_path = bge.logic.expandPath("//data/audio/")


    if script_runner['music_set?'] == False:

        # music_1 = audio_system.playSound(audio_threads, "music", 0, bge.logic.expandPath(audio_path+audio_16), False, 0.4)
        # music_2 = audio_system.playSound(audio_threads, "music", 0, bge.logic.expandPath(audio_path+audio_5), False)
        # music_3 = audio_system.playSound(audio_threads, "music", 0, bge.logic.expandPath(audio_path+audio_3), False)
        music_3 = audio_system.playSound(audio_threads, "music", 0, bge.logic.expandPath(audio_path+audio_2), False)
        # music_4 = audio_system.playSound(audio_threads, "music", 1, bge.logic.expandPath(audio_path+audio_14), False, 0.4)
        music_7 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_7), False)
        music_8 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_8), False)
        music_9 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_9), False)
        music_10 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_10), False)
        music_11 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_11), False)
        music_12 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_12), False)
        music_13 = audio_system.playSound(audio_threads, "dialogue", 0, bge.logic.expandPath(audio_path+audio_13), False)
        # music_5 = audio_system.playSound(audio_threads, "music", 1, bge.logic.expandPath(audio_path+audio_5), False)
        # music_6 = audio_system.playSound(audio_threads, "music", 1, bge.logic.expandPath(audio_path+audio_4), False)
        # convolve = aud.Sound(bge.logic.expandPath(audio_path+audio_7))
        script_runner['music_set?'] = True

    # print(len(shell_scene.lights))


    if not asset_system.libraryExists(lib_1):
    
        asset_system.loadLibrary(lib_1, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)
        # asset_system.unloadLibrary(lib_1, external_inactive_collection)
        #asset_system.unloadLibrary(lib_path)

    if not asset_system.libraryExists(lib_2):

        asset_system.loadLibrary(lib_2, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_3):

        asset_system.loadLibrary(lib_3, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_4):

        asset_system.loadLibrary(lib_4, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_5):

        asset_system.loadLibrary(lib_5, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_6):

        asset_system.loadLibrary(lib_6, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_7):

        asset_system.loadLibrary(lib_7, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_8):

        asset_system.loadLibrary(lib_8, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_9):

        asset_system.loadLibrary(lib_9, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_10):

        asset_system.loadLibrary(lib_10, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_11):

        asset_system.loadLibrary(lib_11, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)

    if not asset_system.libraryExists(lib_12):

        asset_system.loadLibrary(lib_12, lib_path, "object", bge.logic.getCurrentScene(), external_inactive_collection)


    # asset_system.updateParents()

    #print(framework_elements.active_instances)

if script_runner['preliminaries_complete?'] == True:

    testingFunction()
    # pass

elif script_runner['preliminaries_complete?'] == False:

    gamePreliminaries()