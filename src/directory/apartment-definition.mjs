import { layoutGeometry, BODY_GROUP } from '../basement/physics/index.mjs';
const MOVABLE = new Set(['apt_sofa','apt_coffee','apt_chair','apt_console','apt_plant','apt_planter','apt_stool','apt_bed','apt_side','apt_lounger','apt_bistro','apt_telescope','apt_dining','apt_bench','apt_chaise','apt_patio_sofa']);
const rectangle = (r, template, data = {}) => ({ template, position: [r.x + r.w / 2, r.y + r.h / 2], collision_shape: { shape_type: 'box', dimensions: [r.w, r.h] }, data });

/** Authored data -> native packets, once at scene construction. No runtime collision policy. */
export function resolveApartmentDefinition(library, game_db) {
    const map = structuredClone(game_db.places.maps.apt_949), rooms = structuredClone(game_db.places.rooms.apt_949);
    const layout = library.getResource('df_apartment:layout').data;
    const walls = layoutGeometry.cutWallOpenings(map.walls, rooms.doors);
    map.walls=walls;
    const boundaries = [{x:-20,y:-20,w:map.width+40,h:20},{x:-20,y:map.height,w:map.width+40,h:20},{x:-20,y:0,w:20,h:map.height},{x:map.width,y:0,w:20,h:map.height}];
    const entities = [...walls, ...boundaries].map((r, i) => rectangle(r, 'df_apartment:wall', { role:'wall', authored_id:`wall_${i}` }));
    layout.props.forEach((p, index) => {
        const r = { x:p.x, y:p.y, w:p.width, h:p.height };
        const packet=rectangle(r, 'df_apartment:furniture', { role:'prop', authored_id:`prop_${index}`, layout_index:index,
            movable:MOVABLE.has(p.decorType), appearance:structuredClone(p), interaction_type:p.interactionType??null, room_id:p.roomId??null, note_id:p.noteId??null,
            home_position:[p.x+p.width/2,p.y+p.height/2], home_rotation:0 });
        const lamp=layout.lamps.find(l=>l.parent_prop===index);
        const emission=p.light?{radius:p.light.radius,color:p.light.color,position:[p.light.dx??0,p.light.dy??0]}:lamp?{radius:lamp.lightRadius,color:lamp.color,position:[0,0]}:null;
        if(emission){packet.light_shape={shape_type:'circle',radius:emission.radius,local_position:emission.position};packet.data.emission=emission;}
        entities.push(packet);
    });
    layout.lamps.filter(p=>p.parent_prop===undefined).forEach((p,index)=>entities.push({template:'df_apartment:lamp',position:[p.x,p.y],
        render_shape:{shape_type:'circle',radius:20},light_shape:{shape_type:'circle',radius:p.lightRadius},
        data:{role:'lamp',authored_id:`lamp_${index}`,appearance:structuredClone(p)}}));
    map.transitions.forEach((r,index)=>entities.push(rectangle(r,'df_apartment:transition',{role:'transition',authored_id:`exit_${index}`,target:r.target,label:r.label})));
    Object.entries(rooms.rooms).forEach(([id,r])=>entities.push(rectangle(r,'df_apartment:transition',{role:'room',room_id:id,...r})));
    rooms.doors.forEach((d,index)=>{
        const horizontal=d.orientation==='H', hinged=d.type==='hinged';
        if(d.type==='sliding'){
            // Two real kinematic leaves. The artwork and collision bodies share these authored dimensions.
            const length=(horizontal?d.w:d.h)/2-2,travel=(horizontal?d.w:d.h)/2+4;
            for(const side of [-1,1]){
                const position=horizontal?[d.x+d.w/2+side*(length/2+2),d.y+d.h/2]:[d.x+d.w/2,d.y+d.h/2+side*(length/2+2)];
                entities.push({template:'df_apartment:door',position,collision_shape:{shape_type:'box',dimensions:horizontal?[length,d.h]:[d.w,length]},collision_mask:BODY_GROUP.CHARACTER|BODY_GROUP.PROP|BODY_GROUP.PROJECTILE,
                    data:{role:side===-1?'door':'door_panel',authored_id:side===-1?`door_${index}`:`door_${index}_right`,door_key:`door_${index}`,panel_version:2,panel_side:side,appearance:d,trigger_position:[d.x+d.w/2,d.y+d.h/2],closed_position:position,open_position:[position[0]+(horizontal?side*travel:0),position[1]+(horizontal?0:side*travel)],closed_rotation:0,open_rotation:0,open:false}});
            }
        }else{
        const position=hinged?(horizontal?[d.x,d.y+d.h/2]:[d.x+d.w/2,d.y]):[d.x+d.w/2,d.y+d.h/2];
        entities.push({template:'df_apartment:door',position,collision_shape:{shape_type:'box',dimensions:[d.w,d.h],local_position:hinged?(horizontal?[d.w/2,0]:[0,d.h/2]):[0,0]},
            collision_mask:BODY_GROUP.CHARACTER|BODY_GROUP.PROP|BODY_GROUP.PROJECTILE,data:{role:'door',authored_id:`door_${index}`,appearance:d,closed_position:position,
                open_position:hinged?position:[position[0]+(horizontal?d.w:0),position[1]+(horizontal?0:d.h)],closed_rotation:0,open_rotation:hinged?Math.PI/2:0,open:false}});
        }
    });
    for(const [index,l]of rooms.linens.entries()){
        const n=l.segments??5,points=[],edges=[];
        for(let row=0;row<=n;row++){
            points.push([0,l.length*row/n],[l.width,l.length*row/n]);edges.push([row*2,row*2+1]);
            if(row){edges.push([row*2-2,row*2],[row*2-1,row*2+1],[row*2-2,row*2+1],[row*2-1,row*2]);}
        }
        entities.push({template:'df_apartment:curtain',position:[l.x,l.y],render_shape:{shape_type:'circle',radius:l.length+l.width},
            data:{role:'curtain',authored_id:`curtain_${index}`,appearance:l,mesh:{points,edges,anchors:[0,1]}}});
    }
    return { rules:library.getResource('df_apartment:rules').data, map, rooms, entities, soft_lights:structuredClone(layout.soft_lights), player:{template:'df_apartment:player',position:[map.spawn.x,map.spawn.y]} };
}

export function resolveApartmentDyer(game_db){
    const p=game_db.places.dyer_station;
    const position=[p.x+p.width/2,p.y+p.height/2];
    return {template:'df_apartment:furniture',position,collision_shape:{shape_type:'box',dimensions:[p.width,p.height]},
        data:{role:'prop',authored_id:'clothing_dyer',movable:false,interaction_type:'clothing_dyer',home_position:position,home_rotation:0,
            appearance:{...p,color:'#3a2430',interactionType:'clothing_dyer',decorType:'apt_dyer'}}};
}
