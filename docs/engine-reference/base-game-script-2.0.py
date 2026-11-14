# eternaldark949 >> 3.11.2024
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
import numpy
import os # the operating system module
import random # the random for math module
import shutil # the more powerful file handling module
import sys # the other operating system module
import time # the time module
import urllib.request # the network and online file handling 
import zipfile # the zip file extraction module

class g7Engine:

    def __init__(self):
        
        self.elements = self.g7Elements(self) # the elements framework for this engine instance: encapsulates all elements that can be used by the game engine
        self.systems = self.g7Systems(self) # the systems framework for this engine instance: encapsulates all systems that can be used by the game engine
        self.tools = self.g7Tools(self) # the tolls framework for this engine instance: encapsulates all tools that can be used by the game engine

        self.colors = self.g7Colors(self)
        self.keymaps = self.g7KeyMaps(self)
        self.states = self.g7States(self) # the states framework for this engine instance
        self.templates = self.g7Templates(self) # the templates framework for this engine instance

        self.mouse = bge.logic.mouse # the mouse device being used by the engine
        self.keyboard = bge.logic.keyboard # the keyboard device being used by the engine

        self.gamepads = bge.logic.joysticks # list of gamepads being used by the engine

        self.gamepad_1 = self.gamepads[0]
        self.gamepad_2 = self.gamepads[1]
        self.gamepad_3 = self.gamepads[2]
        self.gamepad_4 = self.gamepads[3]
        self.gamepad_5 = self.gamepads[4]
        self.gamepad_6 = self.gamepads[5]
        self.gamepad_7 = self.gamepads[6]
        self.gamepad_8 = self.gamepads[7]

        self.registered_gamepads = {}

        self.registered_keyboard = None
        self.registerd_mouse = None

        self.data_filepath = None

        self.game_name = "UntitledGame"

        self.date = None

        self.finalizeInitialization()

    def updateTime(self):

        pass
    
    def finalizeInitialization(self):

        self.refreshEngineVirtualImage()
        self.systems.initializeSystems()
        self.systems.refreshSystemVirtualImage()
        self.setFilePaths()
    
    def refreshEngineVirtualImage(self):

        self.elements.parent_engine = self
        self.systems.parent_engine = self
        self.tools.parent_engine = self

        self.colors.parent_engine = self
        self.keymaps.parent_engine = self
        self.states.parent_engine = self
        self.templates.parent_engine = self

    def updateGamepads(self):

        self.gamepads = bge.logic.joysticks

        self.gamepad_1 = self.gamepads[0]
        self.gamepad_2 = self.gamepads[1]
        self.gamepad_3 = self.gamepads[2]
        self.gamepad_4 = self.gamepads[3]
        self.gamepad_5 = self.gamepads[4]
        self.gamepad_6 = self.gamepads[5]
        self.gamepad_7 = self.gamepads[6]
        self.gamepad_8 = self.gamepads[7]

    def setFilePaths(self):

        self.data_filepath = bge.logic.expandPath("//data")


    def loadEngineState(self):

        pass
    
    def saveEngineState(self):

        engine_state = { 'engine' : self, 'elements' : self.elements, 'systems' : self.systems }

    def setCursorPosition(self, cursor_position=(0.5, 0.5)): # define the method setCursorPosition, which  sets the mouse cursor to a defined position

        self.mouse.position = cursor_position # set the mouse cursor to the defined position

        return cursor_position # return cursor's position
    
    def takeScreenshot(self):

        screenshot_filepath = bge.logic.expandPath(self.data_filepath+"/screenshots")
        os.makedirs(screenshot_filepath, exist_ok=True)

        now = datetime.datetime.now()
        timestamp = now.strftime("%m.%d.%Y-%H.%M.%S.%f")[:-3]
        screenshot_name = f'{self.game_name}-{timestamp}.png'

        screenshot_fullpath = os.path.join(screenshot_filepath, screenshot_name)
        bge.render.makeScreenshot(screenshot_fullpath)

    class g7Colors:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

    class g7KeyMaps:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

            self.default_keymap = self.g7Default(self, self.parent_engine)

        class g7Default: # class wrapper for the default keymap used by the game engine

            def __init__(self, parent_keymaps, parent_engine): # initialize the g7Default class

                self.parent_engine = parent_engine
                self.parent_keymaps = parent_keymaps

                self.forwards = bge.events.WKEY
                self.left = bge.events.AKEY
                self.right = bge.events.DKEY
                self.backwards = bge.events.SKEY

                self.sprint = bge.events.LEFTSHIFTKEY

                self.interact = bge.events.FKEY
                self.scroll_inventory_left = bge.events.QKEY
                self.scroll_inventory_right = bge.events.EKEY
                self.switch_inventory_hands = bge.events.TABKEY

                self.combat_target = bge.events.MIDDLEMOUSE

                self.exit = bge.events.ESCKEY
    
    class g7States: # class wrapper for the states available within the game engine

        def __init__(self, parent_engine): # initialize the g7States class

            self.parent_engine = parent_engine # cache the parent engine in variable

            # engine FEATURE states
            
            self.FEATURE_INACTIVE = 0
            self.FEATURE_ACTIVE = 1

            # engine AXIS REFERENCES

            self.X_AXIS = 0
            self.Y_AXIS = 1
            self.Z_AXIS = 2
            
            # engine AXIS states

            self.X_POSITIVE = 0
            self.Y_POSITIVE = 1
            self.Z_POSITIVE = 2
            self.X_NEGATIVE = 3
            self.Y_NEGATIVE = 4
            self.Z_NEGATIVE = 5

            # engine VECTOR states

            self.VECTOR_GLOBAL_X_POSITIVE = (1.0, 0.0, 0.0)
            self.VECTOR_GLOBAL_Y_POSITIVE = (0.0, 1.0, 0.0)
            self.VECTOR_GLOBAL_Z_POSITIVE = (0.0, 0.0, 1.0)

            self.VECTOR_GLOBAL_X_NEGATIVE = (-1.0, 0.0, 0.0)
            self.VECTOR_GLOBAL_Y_NEGATIVE = (0.0, -1.0, 0.0)
            self.VECTOR_GLOBAL_Z_NEGATIVE = (0.0, 0.0, -1.0)

            # engine PLAYBACK states

            self.PLAY_QUEUE = 0
            self.PLAY_SINGLE = 1
            
            self.LOOP_OFF = 0
            self.LOOP_ALL = 1
            self.LOOP_ONE = 2

            self.SHUFFLE_OFF = 0
            self.SHUFFLE_ON = 1

            # engine VEHICLE states

            self.TYPE_BIKE = 0
            self.TYPE_COUPE = 1
            self.TYPE_SEDAN = 2
            self.TYPE_SUV = 3
            self.TYPE_TRUCK = 4

            self.HOVER_CAR = 5
            self.SKATEBOARD = 6
            
            self.TWO_WHEELER = 0
            self.THREE_WHEELER = 1
            self.FOUR_WHEELER = 2
            self.SIX_WHEELER = 3
            self.EIGHT_WHEELER = 4
            self.TEN_WHEELER = 5
            self.TWELVE_WHEELER = 6
            self.SIXTEEN_WHEELER = 7
            self.EIGHTEEN_WHEELER = 8
            self.TWENTY_FOUR_WHEELER = 9

            # world TIME states

            self.MORNING = 0
            self.DAY = 1
            self.EVENING = 2
            self.NIGHT = 3

            # world WEATHER states

            self.CLEAR = 0
            self.RAINING = 1
            self.SNOWING = 2

            # world WEATHER INTENSITY states

            self.LIGHT = 0
            self.NORMAL = 1
            self.HEAVY = 2
            self.HELLISH = 3

            # engine CHARACTER states

            self.NONPLAYER = 0
            self.PLAYER = 1

            # engine RELATIONSHIP states

            self.ENEMY = 0
            self.FRIEND = 1
            self.STRANGER = 2

            # further RELATIONSHIP descriptors

            self.AMIABLE = 0
            self.CLOSE = 1
            self.CRUSTY = 2
            self.FAVORABLE = 3
            self.UNFAVORABLE = 4

            # game CONTEXT states

            self.LOADING = 0
            self.MAIN_GAME = 1
            self.MAIN_MENU = 2
            self.PAUSE_MENU = 3
            self.USING_MODIFIER_KEY = 4

            # engine AUDIO THREAD REFERENCE states

            self.DIALOGUE_THREAD = 0
            self.MUSIC_THREAD = 1
            self.SFX_THREAD = 2

            # engine PARTITION states

            self.CONSTANT = 0
            self.TEMPORARY = 1


    class g7Templates:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

            # assembly templates for VEHICLES
            # TEMPLATE = (tire_friction, suspension_compression, suspension_damping, suspension_stiffness, roll_influence)
            
            self.VEHICLE_GENT_ENVY_VZERO = (5.0, 1.0, 2.0, 60.0, 0.10) # GENT Envy V0
            self.VEHICLE_LADYBM_VONE = (5.0, 1.0, 2.0, 60.0, 0.09) # LADY BlackMark V1

    class g7Elements: # class wrapper for the  engine elements; these are basic entity types that can be accessed and used by the engine

        def __init__(self, parent_engine):

            # g7Elements BASE PROPERTIES
            
            self.parent_engine = parent_engine

            self.max_instances_per_type = 1000

            # g7Elements BASE LISTS
            
            self.active_instances = []

            self.active_cameras = []
            self.active_characters = []
            self.active_vehicles = []

        def createCamera(self):

            pass

        def createCameraPivot(self):

            pass

        def createCharacter(self, name="Unnamed Character", id=None, linked_object=None):

            pass

        def createSpawnPoint(self):

            pass

        def createVehicle(self):

            pass

        def createVirtualChild(self, name, parent_object, child_initial_position):

            virtual_child = self.virtualChild(self)

            virtual_child.init_position = mathutils.Vector(child_initial_position)
            virtual_child.parent_object = parent_object
            virtual_child.name = name

        def createWorldPartition(self, name, horizontal_span, vertical_span, row, column, elevation_cell):

            world_partition = self.gameWorldPartition(self) # cache a new instance of gameWorldPartition in variable

            world_partition.name = name

            world_partition.horizontal_span = horizontal_span
            world_partition.vertical_span = vertical_span

            world_partition.horizontal_row = row
            world_partition.horizontal_column = column
            world_partition.elevation_cell = elevation_cell

            # set PARTITION SPACE LIMITS

            world_partition.x_limit_lower = world_partition.horizontal_column * world_partition.horizontal_span
            world_partition.x_limit_upper = world_partition.x_limit_lower + world_partition.horizontal_span
            world_partition.y_limit_lower = world_partition.horizontal_column * world_partition.horizontal_span
            world_partition.y_limit_upper = world_partition.y_limit_lower + world_partition.horizontal_span
            world_partition.z_limit_lower = world_partition.elevation_cell * world_partition.vertical_span
            world_partition.z_limit_upper = world_partition.z_limit_lower + world_partition.vertical_span

            return world_partition
        
        def verifyId(self, element):

            pass

        def getCurrentPartitionOf(self, asset_linked_object):

            asset_system = self.parent_engine.systems.asset_system

            current_partition_of_object = asset_system.getObjectPartition(asset_linked_object)

            return current_partition_of_object
        
        def initializeInstances(self):

            pass


        class gameCamera:

            def __init__(self, parent_elements):

                self.pivot = None
                self.linked_object = None

            def setPivot(self):

                pass
        
        class gameCameraPivot:

            def __init__(self, parent_elements):

                self.parent_elements = parent_elements

                self.camera = None

                self.camera_reset = None

                self.limit_axis = None # axis to be limited in order to prevent rolling camera when tracking
                self.limit_axis_rotational_value = None # rotational value in radians of the limit axis

                self.limit_axis_value = 0.0

                self.linked_object = None

                self.rotation = None
                self.x_rotation = None
                self.y_rotation = None
                self.z_rotation = None

                self.invert_x = False # determines whether the x axis will be inverted or not
                self.invert_y = False # determines whether the y axis will be inverted or not

                self.maximum_x = None # maximum angular limit of the x axis to prevent camera going upside down

                self.rotation_acceleration = 1.0

                self.smooth_motion = False
                self.smoothing_modifier = 0.5
                self.smoothing_steps = 60

            def adhereToAxisLimit(self):

                if self.limit_axis_rotational_value != self.limit_axis_value: # if the axis to be limited has a rotation 

                    if self.limit_axis == self.parent_elements.parent_engine.states.X_AXIS: # if the x axis is to be limited

                        self.linked_object.worldOrientation = mathutils.Euler((math.radians(self.limit_axis_value), self.y_rotation, self.z_rotation), 'XYZ') # set the axis rotation to zero
                    
                    if self.limit_axis == self.parent_elements.parent_engine.states.Y_AXIS: # if the y axis is to be limited

                        self.linked_object.worldOrientation = mathutils.Euler((self.x_rotation, math.radians(self.limit_axis_value), self.z_rotation), 'XYZ') # set the axis rotation to zero

                    if self.limit_axis == self.parent_elements.parent_engine.states.Z_AXIS: # if the z axis is to be limited

                        self.linked_object.worldOrientation = mathutils.Euler((self.x_rotation, self.y_rotation, math.radians(self.limit_axis_value)), 'XYZ') # set the axis rotation to zero

            def enableSmoothMotion(self):

                self.rotation_acceleration = self.smoothing_modifier

            def disableSmoothMotion(self):

                self.rotation_acceleration = 1.0

            def freeMovement(self):

                pass
            
            def linkToTarget(self):

                pass

            def lookAtTarget(self):

                pass

            def migrateToTarget(self):

                pass

            def updateAxisRotations(self):

                self.rotation = self.linked_object.worldOrientation

                self.x_rotation = self.rotation.to_euler().x
                self.y_rotation = self.rotation.to_euler().y
                self.z_rotation = self.rotation.to_euler().z

            def updateState(self):

                self.adhereToAxisLimit()
                self.updateAxisRotations()


        class gameCharacter:

            def __init__(self, parent_elements):

                self.parent_elements = parent_elements

                self.awareness = self.awarenessMatrix(self)

                self.name = None
                self.id = None

                self.linked_object = None

                self.dimensions_x = None
                self.dimensions_y = None
                self.dimensions_z = None

                self.physics_type = None

            def updateAwarenessMatrix(self):

                self.dimensions_x = self.linked_object.blenderObject.dimensions[0]
                self.dimensions_y = self.linked_object.blenderObject.dimensions[1]
                self.dimensions_z = self.linked_object.blenderObject.dimensions[2]


            class awarenessMatrix:

                def __init__(self, parent_character):

                    self.parent_character = parent_character

                    self.evaluation_radius = 400.0

                    self.personal_space = self.evaluation_radius*0.05

                    self.forwards_point = None
                    self.backwards_point = None

                def analyzeSurroundings(self):

                    pass

            class basicPhysicsSetup:

                def __init__(self, parent_character):

                    self.parent_character = parent_character

                    self.movement_base = None

            class advancedPhysicsSetup:

                def __init__(self, parent_character):

                    self.parent_character = parent_character

                    self.movement_center = None

        class gameDynamicLamp:

            pass

        class gameParkourPoint:

            pass

        class gameVehicle:

            pass

        class virtualChild:

            def __init__(self, parent_elements):

                self.parent_elements = parent_elements
                
                self.name = None
                self.id = None

                self.init_position = None
                self.parent_object = None

                self.worldPosition = self.init_position

            def updatePosition(self):

                parent_matrix = self.parent_object.worldTransform
                updated_position = parent_matrix @ self.init_position

                self.worldPosition = updated_position

        class gameSpawnPoint:

            def __init__(self, parent_elements, linked_object):

                self.parent_elements = parent_elements
                
                self.linked_object = linked_object

                self.object_to_spawn = None
                self.on_schedule = False
                self.unload_distance = 0.0

        class gameWorldPartition:

            def __init__(self, parent_elements):

                self.parent_elements = parent_elements

                self.name = None # name of the partition
                self.id = None # id of the partition

                self.horizontal_span = None
                self.vertical_span = None

                self.horizontal_column = None
                self.horizontal_row = None
                self.elevation_cell = None

                self.x_limit_lower = None
                self.x_limit_upper = None
                self.y_limit_lower = None
                self.y_limit_upper = None
                self.z_limit_lower = None
                self.z_limit_upper = None

                self.has_central_focus = False

                self.spawn_points = []

            def returnSelf(self):
                
                return self

            def isWithinLimits(self, vector):

                vector_within_x = self.x_limit_lower <= vector[0] <= self.x_limit_upper
                vector_within_y = self.y_limit_lower <= vector[1] <= self.y_limit_upper
                vector_within_z = self.z_limit_lower <= vector[2] <= self.z_limit_upper

                if vector_within_x and vector_within_y and vector_within_z:

                    return True
                
                else:

                    return False
                
            def calculateAdjacents(self):

                pass

    class g7Systems:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

        def initializeSystems(self):

            self.asset_system = self.assetSystem(self, self.parent_engine)
            self.audio_system = self.audioSystem(self, self.parent_engine)
            self.controls_system = self.controlsSystem(self, self.parent_engine)
            self.time_system = self.timeSystem(self, self.parent_engine)
            self.world_system = self.worldSystem(self, self.parent_engine)

        def refreshSystemVirtualImage(self):

            self.asset_system.parent_system = self
            self.time_system.parent_system = self
            self.world_system.parent_system = self

            self.audio_system.refreshAudioSystemVirtualImage()

        class assetSystem: # class wrapper for the assetSystem

            def __init__(self, parent_system, parent_engine): # initialize the assetSystem class

                # assetSystem BASE PROPERTIES

                self.active = False
                self.parent_system = parent_system
                self.parent_engine = parent_engine
                self.libraries = []
                self.linked_objects = []
                self.unload_distance_modifier = 1000 # multiplier for distance outside which, spawns are unloaded from the scene
                self.shadow_activation_distance = 0.25 #  multiplier for distance within which, standard shadows are activated
                self.contact_shadow_activation_distance = 0.1 # multiplier for distance within which, contact shadows are activated

                self.processing = False
                self.streaming_library_active = False
                self.streaming_library_inactive = False

                self.grid_size_horizontal = 1000
                self.grid_size_vertical = 1000
                self.cubic_grid = True

                # assetSystem DYNAMIC OPS PROPS

                self.pending_operations = [] # list of pending operations to be completed by the system

                # assetSystem DYNAMIC LISTS

                self.render_objects_active = [] # list of objects marked for render that will be added to the scene's active objects
                self.render_objects_inactive = [] #list of objects marked for render that will be added to the scene's inactive objects
                
                self.constant_spawn_points = [] # list of spawn points that stay persistent in the scene regardless of player proximity
                self.streamed_spawn_points = [] # list of spawn points that are streamed into the scene during gameplay based on player proximity
                self.spawn_points_unaccounted_within_proximity = [] # list of spawn points that are within proximity but have not been accounted for
                self.spawn_points_unaccounted_outside_proximity = [] # list of spawn points that are outside proximity but have not been accounted for
                self.spawns = [] # list of spawned objects within the scene
                self.spawns_remove_ready = [] # list of spawns that are outside proximity and are ready to be removed
                self.dynalamps = [] # list of dynamic light sources within the scene
                self.dynalamps_in_use = [] # list of dynamic light sources that are active within the scene
                self.dynalamps_idle = [] # list of dynamic light sources that are not active within the scene
                self.lamps_in_range_shadow = [] # list of lamps within proximity for activation of standard shadows
                self.lamps_in_range_contact_shadow = [] # list of lamps iwithn proximity for activation of contact shadows
                self.lamps_out_of_range_shadow = [] # list of lamps outside proximity for activation of standard shadows
                self.lamps_out_of_range_contact_shadow = [] # list of lamps ioutside proximity for activation of contact shadows
                self.lamps_that_have_scheduling = [] # list of lanps that are designated to have scheduled times such as day/night scheduling for street lamps

                # assetSystem DICTIONARIES

                self.partitions = {}
                self.partitions_temp = []

                # assetSystem STATUS

                self.central_reference_point = bge.logic.getCurrentScene().active_camera
                self.current_partition = self.getObjectPartition(self.central_reference_point)
                

            def libraryExists(self, library_name):

                library_list = bpy.data.libraries # generate a temporary list of libraries that are loaded in memory

                if library_name in library_list: # if the requested library filepath exists in the temporary list, then the library has been loaded

                    library_exists = True # the library exists in memory

                elif library_name not in library_list: # if the requested library filepath does not exist in our temporary list, then the library has not been loaded

                    library_exists = False # the library does not exist in memory

                return library_exists # return the value boolean for if the library exists in memory or not
            

            def listLibraries(self): # define the method listLibraries, which will print and return a list of the libraries currently loaded into memory

                library_use_list = [] # create an empty list to be populated by the libraries used in memory

                library_list = bpy.data.libraries # get the list of libraries loaded in memory, cache in variable

                for library in library_list: # for each library in the library list

                    library_use_list.append(library) # add each library to the generated empty list

                # print(library_use_list) # print the list of libraries that was generated
                    
                return library_use_list # return the library list
            
            def generateWorldPartition(self, game_object):
                
                object_column = math.floor(game_object.worldPosition.x / self.grid_size_horizontal) # use object position along x axis to determine its virtual grid column
                object_row = math.floor(game_object.worldPosition.y / self.grid_size_horizontal) # use object position along y axis to determine its virtual grid row
                object_vertical_cell = math.floor(game_object.worldPosition.z / self.grid_size_vertical) # use object position along z axis to determine its virtual grid cell

                object_column_string = self.parseStringPartition(object_column) # get the string format of target object's column
                object_row_string = self.parseStringPartition(object_row) # get the string format of target object's row
                object_vertical_cell_string = self.parseStringPartition(object_vertical_cell) # get the string format of object's cell

                partition_name = f'PART.R{object_row_string}.C{object_column_string}.V{object_vertical_cell_string}' # generate the name of the partition using the parsed strings

                # print(partition_name)

                if partition_name not in self.partitions: # if the generated partition's name is not in the asset system's partition dictionary

                    objects_within = [] # the partition list of object's within is initialized empty

                    partition = self.parent_engine.elements.createWorldPartition(partition_name, self.grid_size_horizontal, self.grid_size_vertical, object_row, object_column, object_vertical_cell) # generate an instance of the worldPartition object
                    self.partitions[partition_name] = (partition, objects_within) # create new entry in the partition dictionary for the new partition object
                    self.partitions[partition_name][1].append(game_object) # add the target object to the objects within list attached to the partition

                elif partition_name in self.partitions: # if the generated partition name is already in the asset system's partition dictionary

                    self.partitions[partition_name][1].append(game_object) # add the target object to the objects within list attached to the partition

            def getObjectPartition(self, game_object):

                object_column = math.floor(game_object.worldPosition.x / self.grid_size_horizontal) # use object position along x axis to determine its virtual grid column
                object_row = math.floor(game_object.worldPosition.y / self.grid_size_horizontal) # use object position along y axis to determine its virtual grid row
                object_vertical_cell = math.floor(game_object.worldPosition.z / self.grid_size_vertical) # use object position along z axis to determine its virtual grid cell

                object_column_string = self.parseStringPartition(object_column) # get the string format of target object's column
                object_row_string = self.parseStringPartition(object_row) # get the string format of target object's row
                object_vertical_cell_string = self.parseStringPartition(object_vertical_cell) # get the string format of object's cell

                partition_name = f'PART.R{object_row_string}.C{object_column_string}.V{object_vertical_cell_string}' # create the partition name

                return partition_name # return the generated partition name

            def parseStringPartition(self, test_value):

                if 0 <= test_value: # if the test value is positive

                    return_string = f'P{abs(test_value)}' # append P to the test value

                elif 0 > test_value: # if the test value is negative

                    return_string = f'N{abs(test_value)}' # append N to the test value

                return return_string # return the generated string
            
            def updateState(self):

                self.current_partition = self.getObjectPartition(self.central_reference_point)

                # self.partitions[self.current_partition][0].calculateAdjacents()

            def loadLibrary(self, library_name, library_filepath, library_type, targeted_scene, targeted_collection): # define the method loadLibrary, which loads requested blendfile libraries into memory

                target_scene = targeted_scene # cache the target scene in a variable
                target_collection = targeted_collection # cache the target collection in a variable

                if self.libraryExists(library_name): # if the requested library exists in memory already

                    pass

                elif not self.libraryExists(library_name):

                    self.streaming_library_active = True
                    self.streaming_library_inactive = True

                    converted_game_objects_active = []
                    converted_game_objects_inactive = []

                    if library_type == "object":

                        with bpy.data.libraries.load(library_filepath+library_name) as (library_data_streaming_from, library_data_streaming_to): # start the library loading process

                            library_data_streaming_to.objects = library_data_streaming_from.objects # update the destination library with the objects from the external library

                        imported_objects = library_data_streaming_to.objects # cache the loaded objects' list in a variable
                        self.sortRenderObjects(imported_objects)

                        for blender_object in self.render_objects_active: # for each blender object in the active render list

                            blender_object.hide_viewport = False # set the object to be visible in the viewport

                            if blender_object.name not in target_collection.objects: # if the object is not in the target collection

                                target_collection.objects.link(blender_object) # link the imported blender object to the target collection
                                game_object = target_scene.convertBlenderObject(blender_object) # generate a game object from the blender object
                                converted_game_objects_active.append(game_object) # add the game object to the converted active objects list
                                game_object['parent'] = blender_object.parent # set the parent property as the object's parent

                                self.sortObjectBasedOnProperties(game_object) # run check on object based on built in properties and allocate to lists accordingly

                        else: # once done checking each object in the active render list

                            for game_object in converted_game_objects_active:

                                self.generateWorldPartition(game_object)

                                if 'parent' in game_object and game_object['parent']:

                                    game_object.setParent(shell_scene.objects[game_object['parent'].name])

                            else:

                                self.streaming_library_active = False
                                

                        for blender_object in self.render_objects_inactive:

                            blender_object.hide_viewport = True

                            if blender_object.name not in target_collection.objects:

                                target_collection.objects.link(blender_object) # link the imported blender object to the target collection
                                game_object = target_scene.convertBlenderObject(blender_object) # generate a game object from the blender object
                                converted_game_objects_inactive.append(game_object)
                                game_object['parent'] = blender_object.parent

                                self.sortObjectBasedOnProperties(game_object)

                        else:

                            for game_object in converted_game_objects_inactive:

                                if 'parent' in game_object and game_object['parent']:

                                    game_object.setParent(shell_scene.objectsInactive[game_object['parent'].name])

                            else:

                                self.streaming_library_inactive = False
                                
                                # for item in self.partitions.values():

                                #     print(item[0].name, item[1])
                                #     print("")


            def manageScheduling(self):

                for lamp in self.lamps_that_have_scheduling:

                    lamp_data = lamp['spawn_parent']['master_lamp'].blenderObject.data

                    if not lamp['spawn_parent']['backup_saved']:

                        lamp['spawn_parent']['energy_backup'] = lamp['spawn_parent']['value_energy']
                        lamp['spawn_parent']['backup_saved'] = True

                    elif lamp['spawn_parent']['backup_saved']:

                        pass

            def manageSpawns(self):

                pass

            def populateWorld(self, targeted_scene=bge.logic.getCurrentScene()):

                blender_system_active_object_list = targeted_scene.objects
                blender_system_inactive_object_list = targeted_scene.objectsInactive
                
                target_scene = targeted_scene
                target_camera = target_scene.active_camera
                target_partition = self.getObjectPartition(target_camera)

                target_partition_entry = self.partitions[target_partition]

                self.updateLists(target_camera)

                if self.spawn_points_unaccounted_within_proximity:

                    for spawn_point in self.spawn_points_unaccounted_within_proximity:

                        if spawn_point['type'] == 'light':

                            target_lamp = self.dynalamps_idle[0]

                            spawned_lamp = target_scene.addObject(target_lamp, spawn_point, 0, False)
                            spawned_lamp['spawn_parent'] = spawn_point
                            spawned_lamp['unload_distance'] = spawn_point['unload_distance']
                            spawned_lamp['use_shadow'] = False
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

                                if spawned_object.children:

                                    for game_object in spawned_object.children:

                                        if 'spawn' in game_object:

                                            self.streamed_spawn_points.append(game_object)

                if self.spawn_points_unaccounted_outside_proximity:

                    for spawn_point in self.spawn_points_unaccounted_outside_proximity:

                        spawn['has_object'] = False

                    for spawn in self.spawns_remove_ready:

                        spawn_id = spawn['spawn_parent']['object']

                        if 'dynalamp' in spawn:

                            master_lamp = spawn['spawn_parent']['master_lamp']

                            master_lamp['active_spawn'] = False
                            self.spawns.remove(spawn_id)
                            spawn.endObject()

                        elif 'dynalamp' not in spawn:

                            for child in spawn.children:

                                if 'spawn' in child:

                                    self.streamed_spawn_points.remove(child)

                            else:

                                self.spawns.remove(spawn_id)
                                spawn_id.endObject()
                                spawn.endObject()

            
            def sortObjectBasedOnProperties(self, game_object):

                if 'spawn' in game_object and game_object['render'] == True:

                    self.constant_spawn_points.append(game_object)
                    self.streamed_spawn_points.append(game_object)

                if 'parkour' in game_object and game_object['render'] == True:

                    self.parent_engine.elements.parkour_points.append(game_object)

                if 'dynalamp' in game_object:

                    self.dynalamps.append(game_object)
                    self.dynalamps_idle.append(game_object)
            
            def sortRenderObjects(self, library_data):

                self.render_objects_active = [blender_object for blender_object in library_data if "render" in blender_object.game.properties and blender_object.game.properties['render'].value == True]
                self.render_objects_inactive = [blender_object for blender_object in library_data if "render" in blender_object.game.properties and blender_object.game.properties['render'].value == False]

                # print("Sorted library data.")
            
            def updateLists(self, proximity_reference):

                self.spawn_points_unaccounted_within_proximity = [spawn_point for spawn_point in self.streamed_spawn_points if proximity_reference.getVectTo(spawn_point)[0] < spawn_point['unload_distance']*1000 and not spawn_point['has_object']]
                self.spawn_points_unaccounted_outside_proximity = [spawn_point for spawn_point in self.streamed_spawn_points if proximity_reference.getVectTo(spawn_point)[0] > spawn_point['unload_distance']*1000 and spawn_point['has_object']]
                self.dynalamps_idle = [lamp for lamp in self.dynalamps if not lamp['active_spawn']]
                self.dynalamps_in_use = [lamp for lamp in self.dynalamps if lamp['active_spawn']]
                self.spawns_remove_ready = [spawn for spawn in self.spawns if proximity_reference.getVectTo(spawn)[0] > spawn['unload_distance']*1000]
            
            def updateParents(self):

                for game_object in self.parentless_active:

                    pass
            
            # def updateState(self):

            #     self.populateWorld()

        class audioSystem: # class wrapper for the audioSystem

            def __init__(self, parent_system, parent_engine):

                self.active = False
                self.parent_system = parent_system
                self.parent_engine = parent_engine

                self.audio_device = aud.Device()

                self.threads = self.audioThreads(self)

                self.volume = self.volumeControl(self)

                self.target_thread = None

            def refreshAudioSystemVirtualImage(self):

                self.threads.parent_audio_system = self
                self.volume.parent_audio_system = self

                self.threads.dialogue.threads_parent = self.threads

            def updateState(self):

                self.threads.managePlayback()

                self.threads.dialogue.calculateTrueVolume()

            def playSound(self, thread_type, directory, sound_name, ignore_queue=True, layer=0, volume=1.0, keep_in_memory=False):

                threads = self.threads

                filepath = bge.logic.expandPath(directory+sound_name)
                sound_file = aud.Sound.file(filepath)
                
                if thread_type == self.parent_engine.states.DIALOGUE_THREAD:

                    self.target_thread = self.threads.dialogue
                
                    if ignore_queue:

                        for i in range(threads.max_layers):

                            if i not in self.target_thread.layers_in_use and sound_name not in self.target_thread.duplicate_failsafe_list:

                                self.target_thread.duplicate_failsafe_list.append(sound_name)

                                playback_layer = i
                                self.target_thread.layers_in_use.append(playback_layer)
                                virtual_playback_controller = self.audio_device.play(sound_file, keep_in_memory)
                                virtual_playback_controller.volume = volume*self.target_thread.true_volume
                                self.target_thread.sounds_now_playing.append((virtual_playback_controller, playback_layer, self.target_thread, sound_name))

                                return (virtual_playback_controller, playback_layer)
                            
                            elif sound_name in self.target_thread.duplicate_failsafe_list:

                                break

            class audioThreads:

                def __init__(self, parent_audio_system):

                    self.parent_audio_system = parent_audio_system

                    self.dialogue = self.dialogueThread(self)

                    self.max_layers = 50 # maximum layers that can be generated in a thread for playing audio

                def checkAudioStatus(self, audio_object):

                    virtual_playback_controller = audio_object[0]
                    playback_layer = audio_object[1]
                    target_thread = audio_object[2]
                    sound_name = audio_object[3]

                    if virtual_playback_controller.status == True:

                        pass

                    elif virtual_playback_controller.status == False:

                        target_thread.layers_in_use.remove(playback_layer)
                        target_thread.duplicate_failsafe_list.remove(sound_name)
                        target_thread.sounds_now_playing.remove(audio_object)

                def managePlayback(self):

                    for i in range(1):

                        if i == 0:

                            target_thread = self.dialogue

                            if len(target_thread.sounds_now_playing) > 0:

                                audio_states = list(map(self.checkAudioStatus, target_thread.sounds_now_playing[:]))

                        elif i == 1:

                            pass


                class dialogueThread:

                    def __init__(self, threads_parent):

                        self.threads_parent = threads_parent

                        self.sound_queue = []
                        self.sounds_now_playing = []
                        self.layers_in_use = []

                        self.duplicate_failsafe_list = []

                        self.true_volume = None

                    def calculateTrueVolume(self):

                        master_volume = self.threads_parent.parent_audio_system.volume.master
                        dialogue_volume = self.threads_parent.parent_audio_system.volume.dialogue
                        # sfx_volume = self.threads_parent.parent_audio_system.volume.sfx

                        normalized_master_volume = master_volume*0.01
                        normalized_thread_volume = dialogue_volume*0.01

                        self.true_volume = normalized_master_volume*normalized_thread_volume

                    def isPlayingAudio(self, layer=None): # define the method isPlayingAudio, which returns whether a thread id playing audio, whether generally or in a particular layer

                        if not layer: # if a layer is not passed as an argument
                        
                            if self.sounds_now_playing: # if the now playing list has any items in it

                                return True # the thread is playing audio: return that the condition is True
                            
                            elif not self.sounds_now_playing: # if the now playing list is empty

                                return False # the thread is not playing audio: return that the condition is False
                            
                        elif layer: # however, if a layer has been passed as an argument

                            if layer in self.layers_in_use: # if the requested layer is in the used layers list

                                return True # the requested layer is playing audio: return that the condition is True
                            
                            elif layer not in self.layers_in_use: # however, if the requested layer is not in the used layers list

                                return False # the requested layer is not playing audio: return that the condition is False

                class musicThread:

                    pass

                class sfxThread:

                    pass

            class volumeControl:

                def __init__(self, parent_audio_system):

                    self.parent_audio_system = parent_audio_system

                    self.master = 100
                    self.dialogue = 100
                    self.music = 100
                    self.sfx = 100

                    self.dial = self.volumeDial(self)

                class volumeDial:

                    def __init__(self, volume_controller):

                        self.volume_controller = volume_controller

                        self.music_lowering_percentage = 0.30
                        self.music_lowering_speed = 2.0

                        self.spin_increment = 0.01

        class contextSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system
        
        class controlsSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system

                # gamepad Buttons

                self.gamepadA = 0
                self.gamepadB = 1
                self.gamepadX = 2
                self.gamepadY = 3
                self.gamepadBack = 4
                self.gamepadStart = 5
                self.gamepadLStickButton = 6
                self.gamepadRStickButton = 7
                self.gamepadLBumper = 9
                self.gamepadRBumper = 10
                self.gamepadDUp = 11
                self.gamepadDDown = 12
                self.gamepadDLeft = 13
                self.gamepadDRight = 14

                self.gamepadLStick = 15
                self.gamepadRStick = 16
                self.gamepadLTrigger = 17
                self.gamepadRTrigger = 18

                # gamepad SETTINGS

                self.axis_threshold = 0.15
                self.trigger_threshold = 0.01

                self.initializeGamepads()
                self.initializeKeyboard()
                self.initializeMouse()

            def initializeKeyboard(self):

                self.registerKeyboardInstance(self.createKeyboardInstance(self.parent_engine.keyboard)) # create and register keyboard instance to engine

            def initializeMouse(self):

                self.registerMouseInstance(self.createMouseInstance(self.parent_engine.mouse)) # create and register mouse instance to engine

            def initializeGamepads(self):

                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_1, 0))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_2, 1))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_3, 2))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_4, 3))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_5, 4))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_6, 5))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_7, 6))
                self.registerGamepadInstance(self.createGamepadInstance(self.parent_engine.gamepad_8, 7))
            
            def updateGamepads(self):

                self.parent_engine.updateGamepads()

                registered_gamepads = self.parent_engine.registered_gamepads

                registered_gamepads[0].linked_gamepad = self.parent_engine.gamepad_1
                registered_gamepads[1].linked_gamepad = self.parent_engine.gamepad_2
                registered_gamepads[2].linked_gamepad = self.parent_engine.gamepad_3
                registered_gamepads[3].linked_gamepad = self.parent_engine.gamepad_4
                registered_gamepads[4].linked_gamepad = self.parent_engine.gamepad_5
                registered_gamepads[5].linked_gamepad = self.parent_engine.gamepad_6
                registered_gamepads[6].linked_gamepad = self.parent_engine.gamepad_7
                registered_gamepads[7].linked_gamepad = self.parent_engine.gamepad_8

                for index in range(8):

                    if registered_gamepads[index].linked_gamepad:

                        registered_gamepads[index].getActiveInputs()

            def createGamepadInstance(self, gamepad, index):

                gamepad_instance = self.gamepadInstance(self)

                gamepad_instance.linked_gamepad = gamepad
                gamepad_instance.instance_index = index

                return gamepad_instance
            
            def createKeyboardInstance(self, keyboard):

                keyboard_instance = self.keyboardInstance(self)

                keyboard_instance.linked_keyboard = keyboard

                return keyboard_instance
            
            def createMouseInstance(self, mouse):

                mouse_instance = self.mouseInstance(self)

                mouse_instance.linked_mouse = mouse

                return mouse_instance
            
            def registerGamepadInstance(self, gamepad_instance):

                gamepad_index = gamepad_instance.instance_index

                self.parent_engine.registered_gamepads[gamepad_index] = gamepad_instance

            def registerKeyboardInstance(self, keyboard_instance):

                self.parent_engine.registered_keyboard = keyboard_instance

            def registerMouseInstance(self, mouse_instance):

                self.parent_engine.registered_mouse = mouse_instance
                

            class keyboardInstance:

                def __init__(self, parent_system):

                    self.parent_system = parent_system

                    self.linked_keyboard = None
                    
                    self.input_active = []
                    self.input_just_activated = []
                    self.input_just_released = []

                    self.ghost_image = []


            class mouseInstance:

                def __init__(self, parent_system):

                    self.parent_system = parent_system

                    self.linked_mouse = None

                    self.input_active = []
                    self.input_just_activated = []
                    self.input_just_released = []

                    self.ghost_image = []


            class gamepadInstance:

                def __init__(self, parent_system):

                    self.parent_system = parent_system

                    self.linked_gamepad = None
                    self.instance_index = None

                    self.input_active = []
                    self.input_just_activated = []
                    self.input_just_released = []

                    self.axis_states = []

                    self.left_stick_value = [0.0, 0.0]
                    self.right_stick_value = [0.0, 0.0]
                    self.left_trigger_value = 0.0
                    self.right_trigger_value = 0.0

                    self.ghost_image = []

                def generateGhostImage(self):

                    self.ghost_image = self.input_active

                def getActiveInputs(self):

                    active_buttons = self.linked_gamepad.activeButtons
                    axis_values = self.linked_gamepad.axisValues

                    # print(self.linked_gamepad.hasVibration)

                    # print(self.input_just_activated)
                    # print(self.left_stick_value, self.right_stick_value)
                    # print(self.input_just_released)
                    # print(self.left_trigger_value, self.right_trigger_value)
                    # print(axis_values)

                    # ALL NON-AXIS BUTTONS

                    for button in active_buttons:

                        if button not in self.ghost_image:

                            self.input_just_activated.append(button)

                    # LEFT STICK >>

                    if abs(axis_values[0]) > self.parent_system.axis_threshold or abs(axis_values[1]) > self.parent_system.axis_threshold:

                        # print('YO, the LEFT STICK is drifting :0')

                        self.left_stick_value = [round(axis_values[0], 3), round(axis_values[1], 3)]

                        if abs(self.left_stick_value[0]) < self.parent_system.axis_threshold:

                            self.left_stick_value[0] = round(0.0, 3)

                        elif abs(self.left_stick_value[1]) < self.parent_system.axis_threshold:

                            self.left_stick_value[1] = round(0.0, 3)

                        # ADD THE LEFT STICK TO THE APPROPRIATE INPUT LISTS

                        if self.parent_system.gamepadLStick not in self.axis_states:

                            self.axis_states.append(self.parent_system.gamepadLStick)

                            if self.parent_system.gamepadLStick not in self.input_just_activated:

                                self.input_just_activated.append(self.parent_system.gamepadLStick)

                    elif abs(axis_values[0]) < self.parent_system.axis_threshold and abs(axis_values[1]) < self.parent_system.axis_threshold:

                        # print('No drift :|)')

                        self.left_stick_value = [round(0.0, 3), round(0.0, 3)]

                        if self.parent_system.gamepadLStick in self.axis_states:

                            self.axis_states.remove(self.parent_system.gamepadLStick)

                    # RIGHT STICK >>

                    if abs(axis_values[2]) > self.parent_system.axis_threshold or abs(axis_values[3]) > self.parent_system.axis_threshold:

                        # print('YO, the RIGHT STICK is drifting :0')

                        # ASSIGN THE RIGHT STICK VALUES AND ADJUST BASED ON AXIS THRESHOLDS TO ENSURE AXIS" BENEATH THRESHOLD REMAIN 0

                        self.right_stick_value = [round(axis_values[2], 3), round(axis_values[3], 3)]

                        if abs(self.right_stick_value[0]) < self.parent_system.axis_threshold:

                            self.right_stick_value[0] = round(0.0, 3)

                        elif abs(self.right_stick_value[1]) < self.parent_system.axis_threshold:

                            self.right_stick_value[1] = round(0.0, 3)

                        # ADD THE RIGHT STICK TO THE APPROPRIATE INPUT LISTS

                        if self.parent_system.gamepadRStick not in self.axis_states:

                            self.axis_states.append(self.parent_system.gamepadRStick)

                            if self.parent_system.gamepadRStick not in self.input_just_activated:

                                self.input_just_activated.append(self.parent_system.gamepadRStick)

                    elif abs(axis_values[2]) < self.parent_system.axis_threshold and abs(axis_values[3]) < self.parent_system.axis_threshold:

                        # print('No drift :|)')

                        self.right_stick_value = [round(0.0, 3), round(0.0, 3)]

                        if self.parent_system.gamepadRStick in self.axis_states:

                            self.axis_states.remove(self.parent_system.gamepadRStick)

                    # LEFT TRIGGER >>

                    if axis_values[4] > self.parent_system.trigger_threshold:

                        self.left_trigger_value = round(axis_values[4], 3)

                        if self.parent_system.gamepadLTrigger not in self.axis_states:

                            self.axis_states.append(self.parent_system.gamepadLTrigger)

                            if self.parent_system.gamepadLTrigger not in self.input_just_activated:

                                self.input_just_activated.append(self.parent_system.gamepadLTrigger)

                    elif axis_values[4] < self.parent_system.trigger_threshold:

                        self.left_trigger_value = round(0.0, 3)

                        if self.parent_system.gamepadLTrigger in self.axis_states:

                            self.axis_states.remove(self.parent_system.gamepadLTrigger)

                    # RIGHT TRIGGER >>

                    if axis_values[5] > self.parent_system.trigger_threshold: # if the value of the right trigger is higher than the trigger threshold

                        self.right_trigger_value = round(axis_values[5], 3) # assign its current value to the right trigger value

                        if self.parent_system.gamepadRTrigger not in self.axis_states: # if the right trigger is not in the active axis list

                            self.axis_states.append(self.parent_system.gamepadRTrigger) # add the right trigger to the list

                            if self.parent_system.gamepadRTrigger not in self.input_just_activated:

                                self.input_just_activated.append(self.parent_system.gamepadRTrigger)
                            
                    elif axis_values[5] < self.parent_system.trigger_threshold:

                        self.right_trigger_value = round(0.0, 3)

                        if self.parent_system.gamepadRTrigger in self.axis_states:

                            self.axis_states.remove(self.parent_system.gamepadRTrigger)

                    self.input_active = active_buttons + self.axis_states

                    # FINALIZE INPUT HANDLING

                    self.handleInputFinalization() # run the input handling finalization process

                def handleInputFinalization(self): # define the method handleInputFinalization which finalizes the input detection loop cycle

                    # CLEAR INPUT JUST ACTIVATED FROM THE PREVIOUS FRAME
                    
                    for input in self.input_just_activated:

                        if input in self.ghost_image:

                            self.input_just_activated.remove(input)

                    # ADD INPUT JUST RELEASED FROM THE PREVIOUS FRAME

                    for input in self.ghost_image:

                        if input not in self.input_active:

                            self.input_just_released.append(input)

                    # CLEAR INPUT JUST RELEASED FROM THE FRAME BEFORE PREVIOUS

                    for input in self.input_just_released[:]:

                        if input not in self.ghost_image:

                            self.input_just_released.remove(input)

                    else:

                        self.generateGhostImage() # REFRESH the ghost image once done with input finalization

            class inputQueueHandler:

                pass


        class debugSystem:

            def __inti__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system

                self.pending_reports = []
                self.current_report = None

        class parkourSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system

        class timeSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system
        
        class weatherSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system

                self.states_library = self.parent_engine.states

                self.particle_rate = 0
                self.particle_intensity = None


            def createParticlePool(self):

                pass
        
        class worldSystem:

            def __init__(self, parent_system, parent_engine):

                self.parent_engine = parent_engine
                self.parent_system = parent_system

                self.color_library = self.parent_engine.colors

                print(self.color_library)

                self.reference_time_system = self.parent_system.time_system

                # GENERAL world PROPERTIES

                self.time_of_day = None
                self.weather = None
                
                # CITY related PROPERTIES
                
                self.rush_hour = False
                self.street_lights = False

    class g7Tools:

        def __init__(self, parent_engine):

            self.parent_engine = parent_engine

            self.recorder = self.gRecorder(self, self.parent_engine)
           
            self.timer_ids = []
            self.timers = []

        def createTimer(self):

            pass

        
        class gRecorder:

            def __init__(self, parent_tools, parent_engine):

                self.parent_engine = parent_engine
                self.parent_tools = parent_tools

                self.recording_radius = None

            def startRecording(self):

                pass

            def createFrame(self):

                pass

            def prepareFrameData(self):

                pass

            def recordFrame(self):

                pass
        
        class gTimer:

            def __init__(self, parent_tools):

                self.parent_tools = parent_tools
                
                self.id = None
                self.mode = None

                self.start_hours = 0
                self.start_minutes = 0
                self.start_seconds = 0

                self.current_hours = 0
                self.current_minutes = 0
                self.current_seconds = 0

                self.running = False

                self.saved_tick = 0

                self.display_time = None
                self.seperator_symbol = "."

                self.cycle_count = 0

            def setTimer(self, timer_packet):

                if len(timer_packet) == 3:

                    self.start_hours = timer_packet[0]
                    self.start_minutes = timer_packet[1]
                    self.start_seconds = timer_packet[2]

                elif len(timer_packet) == 1:

                    pass

            def startTimer(self):

                pass

            def stopTimer(self):

                pass

            def updateState(self):

                pass


shell_scene = bge.logic.getCurrentScene()
game_manager = bge.logic.getCurrentController().owner
engine_framework = game_manager['engine']

def gamePreliminaries():

    engine_framework = g7Engine()

    game_manager['engine'] = engine_framework


def testingFunction():

    # following section is for ease of programming, not runtime
    # DO NOT RUN WITHOUT COMMENTING THE BELOW LINE
    
    # engine_framework = g7Engine()

    # RUNTIME code

    engine_framework = game_manager['engine']

    if bge.events.F12KEY in engine_framework.keyboard.activeInputs:

        print("YAOI!!!")
        engine_framework.takeScreenshot()

    asset_system = engine_framework.systems.asset_system
    audio_system = engine_framework.systems.audio_system

    collections_list = bpy.data.collections # create list of collections in memory

    # shell_collection = collections_list['Scene Collection']

    internal_main_collection = collections_list['Main Collection']

    external_active_collection = collections_list['Imported Collection (Active)']
    external_inactive_collection = collections_list['Imported Collection (Inactive)']

    default_library_path = bge.logic.expandPath("//data/libraries/")
    default_audio_path = bge.logic.expandPath("//data/audio/")
    
    library_01 = "sdc-test.blend"

    audio_01 = "moonlove - loop01.mp3"

    if bge.events.JKEY in engine_framework.keyboard.activeInputs:

        # audio_system.playSound(0, default_audio_path, audio_01)
        engine_framework.takeScreenshot()

    engine_framework.systems.controls_system.updateGamepads()
    engine_framework.systems.audio_system.updateState()

    asset_system.updateState()

    print(asset_system.current_partition)

    for index in engine_framework.registered_gamepads:

        # print(engine_framework.registered_gamepads[index].linked_gamepad)
        pass

    asset_system.loadLibrary(library_01, default_library_path, "object", shell_scene, external_inactive_collection)


if not game_manager['engine']:

    gamePreliminaries()

else:

    testingFunction()

    


# def gamePreliminaries():

#     if not game_manager['engine_set?']:

#         engine_framework = g7Engine()



# def gamePreliminaries():

#     if game_manager['engine_set?'] == False:

#         engine_framework = g7Engine() # define the engine object and initialize it
#         framework_elements = engine_framework.elements # define the current engine's elements extension
#         framework_systems = engine_framework.systems # define the current engine's systems extension
#         framework_tools = engine_framework.tools

#         game_manager['engine'] = engine_framework # embed engine into game runtime variable
#         game_manager['engine_elements'] = framework_elements # embed engine elements into game runtime variable
#         game_manager['engine_systems'] = framework_systems # embed engine systems into game runtime variable
#         game_manager['engine_tools'] = framework_tools

#         game_manager['timer_list'] = []

#         game_manager['engine_set?'] = True

#     if game_manager['systems_set?'] == False:
        
#         asset_system = framework_systems.assetSystem() # define the current engine's asset system
#         audio_system = framework_systems.audioSystem() # define the current engine's audio system
#         cinematic_system = framework_systems.cinematicSystem() # define the current game's cinematic system
#         control_system = framework_systems.controlSystem() # define the current game's control system
#         parkour_system = framework_systems.parkourSystem(framework_elements)
#         time_system = framework_systems.timeSystem() # define the current game's time system
#         world_system = framework_systems.worldSystem()

#         game_manager['asset_system'] = asset_system
#         game_manager['audio_system'] = audio_system
#         game_manager['cinematic_system'] = cinematic_system
#         game_manager['control_system'] = control_system
#         game_manager['parkour_system'] = parkour_system
#         game_manager['time_system'] = time_system
#         game_manager['world_system'] = world_system

#         game_manager['systems_set?'] = True

#     if game_manager['engine_set?'] == True and game_manager['systems_set?'] == True:

#         game_manager['preliminaries_complete?'] = True
#         game_manager['engine'].setCursorPosition()

# def testingFunction():

#     asset_system.updateState()

#     engine = g7Engine()
#     world = engine.systems.world_system.reference_time_system

# shell_scene = bge.logic.getCurrentScene()
# game_manager = bge.logic.getCurrentController().owner
# game_manager_object = bpy.data.objects['Game Manager']

# engine_framework = game_manager['engine']
# framework_elements = game_manager['engine_elements']
# framework_systems = game_manager['engine_systems']
# framework_tools = game_manager['engine_tools']

# asset_system = game_manager['asset_system']
# audio_system = game_manager['audio_system']
# cinematic_system = game_manager['cinematic_system']
# control_system = game_manager['control_system']
# parkour_system = game_manager['parkour_system']
# time_system = game_manager['time_system']
# world_system = game_manager['world_system']

# collections_list = bpy.data.collections # create list of collections in memory

# # shell_collection = collections_list['Scene Collection']

# internal_main_collection = collections_list['Main Collection']

# external_active_collection = collections_list['Imported Collection (Active)']
# external_inactive_collection = collections_list['Imported Collection (Inactive)']