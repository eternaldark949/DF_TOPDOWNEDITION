// ===== LV0 BASEMENT =====
import {vector,number,rotate,add,sub,length,angleDelta,EPS,BODY_GROUP} from '../core/values.mjs';
import {bodyActive} from '../core/state.mjs';
import {referenceBody,referencePosition} from '../spatial/queries.mjs';
import {pathGeometry} from '../motion/path-geometry.mjs';

/** Generic attachment-local launch aperture. No vehicle, weapon or game policy. */
export function normalizeEmitter(packet){
 if(packet===null||packet===undefined)return null;
 if(typeof packet!=='object'||Array.isArray(packet))throw new TypeError('Emitter requires a descriptor or null');
 const {enabled=true,local_position=[0,0],local_rotation=0,half_angle=Math.PI/2,inherit_velocity=true}=packet;
 if(typeof enabled!=='boolean'||typeof inherit_velocity!=='boolean')throw new TypeError('Emitter flags must be boolean');
 return {enabled,local_position:vector(local_position),local_rotation:number(local_rotation,'emitter rotation'),half_angle:number(half_angle,'emitter half_angle',0,Math.PI),inherit_velocity};
}
export function mountedLaunchState(world,source,{local_position=[0,0],target,direction,angle,angle_offset=0,collision_shape={shape_type:'circle',radius:1},blend=1,check_clearance=true,near_range,line_of_sight=false,occlusion_groups=BODY_GROUP.STATIC|BODY_GROUP.PROP|BODY_GROUP.VEHICLE}={}){
 const child=world._record(referenceBody(source)),mount=world.getAttachmentState(source),entry=child.parent_mount;
 if(!mount)return {allowed:false,reason:'not_mounted'};
 const identity={attachment_id:mount.attachment_id,revision:mount.revision,parent_body_id:mount.parent_body_id};
 if(mount.pending||mount.detaching||!entry)return {...identity,allowed:false,reason:'attachment_pending'};
 const emitter=entry.emitter;if(!emitter?.enabled)return {...identity,allowed:false,reason:'emitter_disabled'};
 if(!bodyActive(child))return {...identity,allowed:false,reason:'inactive'};
 const parent=entry.parent,parentPose=world._renderBody(parent.handle,blend,{}),aperture=pathGeometry.transformPose(parentPose,emitter),offset=vector(local_position);
 number(angle_offset,'angle_offset');
 let rotation;
 if(target!==undefined){
  const delta=sub(referencePosition(world,target),aperture.position),distance=length(delta);
  if(distance<=Math.abs(offset[1])+EPS)return {...identity,allowed:false,reason:'target_too_close'};
  rotation=Math.atan2(delta[1],delta[0])-Math.asin(offset[1]/distance);
  if(Math.sqrt(Math.max(0,distance*distance-offset[1]*offset[1]))<=offset[0]+EPS)return {...identity,allowed:false,reason:'target_too_close'};
 }else if(angle!==undefined)rotation=number(angle,'angle');
 else if(direction!==undefined){const d=vector(direction);if(length(d)<EPS)throw new TypeError('Projectile heading must be nonzero');rotation=Math.atan2(d[1],d[0]);}
 else rotation=aperture.rotation;
 const launchRotation=rotation+angle_offset,relative=angleDelta(aperture.rotation,launchRotation),position=add(aperture.position,rotate(offset,rotation));
 const radiusVector=sub(position,parentPose.position),carrierVelocity=emitter.inherit_velocity?add(parent.velocity,[-parent.angular_velocity*radiusVector[1],parent.angular_velocity*radiusVector[0]]):[0,0];
 const targetPosition=target===undefined?null:referencePosition(world,target),distance=targetPosition?length(sub(targetPosition,position)):null;
 const inRange=near_range===undefined||distance===null||distance<=number(near_range,'near_range',0);
 const lineClear=!line_of_sight||!targetPosition||!world.raycast({from:position,to:targetPosition,include_groups:occlusion_groups,ignore_body:[child.handle,...(!Array.isArray(target)&&target!==undefined?[referenceBody(target)]:[])],include_ghosts:false});
 const state={...identity,distance,in_range:inRange,line_clear:lineClear,allowed:true,reason:null,position,grip_position:aperture.position,rotation,launch_rotation:launchRotation,direction:[Math.cos(launchRotation),Math.sin(launchRotation)],carrier_velocity:carrierVelocity,relative_angle:relative};
 if(Math.abs(relative)>emitter.half_angle+EPS)return {...state,allowed:false,reason:'outside_arc'};
 if(check_clearance){
  // The authored aperture permits crossing its carrier; scenery/other bodies still block the whole path.
  const ancestors=[child.handle];for(let record=parent;record;record=record.parent_mount?.parent)ancestors.push(record.handle);
  if(!world.getPathClearance({collision_shape,from_rotation:launchRotation,to_rotation:launchRotation,from:world.getBodyPoint(source,[0,0],{blend}).position,to:position,ignore_body:ancestors,include_ghosts:false}).clear)return {...state,allowed:false,reason:'blocked_aperture'};
  // Do not ignore the carrier here: a muzzle placed inside the cabin is never valid.
  if(!world.isPlacementClear(collision_shape,position,{rotation:launchRotation,ignore_body:child.handle,include_ghosts:false}))return {...state,allowed:false,reason:'blocked_muzzle'};
 }
 return state;
}
