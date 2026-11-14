// ===== LV0 BASEMENT =====
import {finite,vector,matrix,inverse,transform,color,identifier,BLENDS} from './values.mjs';

const geometryBuffers = new WeakMap();

export function geometry(packet,out={}){
    if(!packet||typeof packet!=='object')throw new TypeError('Geometry is required');
    if(out.type!==packet.type){delete out.size;delete out.radii;delete out.radius;delete out.commands;}
    out.type=packet.type;
    if(packet.type==='rect'){out.size=vector(packet.size,'size',out.size);out.size.forEach(v=>finite(v,'size',0));out.radius=finite(packet.radius??0,'corner radius',0);}
    else if(packet.type==='ellipse'){out.radii=vector(packet.radii,'radii',out.radii);out.radii.forEach(v=>finite(v,'radius',0));}
    else if(packet.type==='path'){
        if(!Array.isArray(packet.commands))throw new TypeError('Path commands must be data arrays');out.commands??=[];out.commands.length=packet.commands.length;
        const sizes={move:2,line:2,quadratic:4,cubic:6,ellipse:8,close:0};
        for(let i=0;i<packet.commands.length;i++){const cmd=packet.commands[i],kind=cmd?.[0];if(!Object.hasOwn(sizes,kind)||cmd.length!==sizes[kind]+1)throw new TypeError('Invalid path command');const dst=out.commands[i]??[];dst.length=cmd.length;dst[0]=kind;for(let j=1;j<cmd.length;j++)dst[j]=finite(cmd[j],'path coordinate');if(kind==='ellipse'&&(dst[3]<0||dst[4]<0))throw new TypeError('Negative ellipse radius');out.commands[i]=dst;}
    }else throw new TypeError(`Unknown geometry: ${packet.type}`);
    out.fill_rule=packet.fill_rule??'nonzero';if(!['nonzero','evenodd'].includes(out.fill_rule))throw new TypeError('Invalid fill rule');
    return out;
}
function paint(packet,out){
    if(packet===null)return null;if(typeof packet==='string')return color(packet);
    if(!packet||!['linear','radial'].includes(packet.type))throw new TypeError('Invalid paint');
    if(!Array.isArray(packet.stops)||packet.stops.length<2)throw new TypeError('Gradient requires stops');
    if(!out||typeof out!=='object')out={};out.type=packet.type;out.from=vector(packet.from,'gradient from',out.from);out.to=vector(packet.to,'gradient to',out.to);
    if(packet.type==='radial'){out.inner_radius=finite(packet.inner_radius??0,'inner radius',0);out.outer_radius=finite(packet.outer_radius,'outer radius',0);}
    out.stops??=[];out.stops.length=packet.stops.length;
    packet.stops.forEach((stop,i)=>{if(!Array.isArray(stop)||stop.length!==2||finite(stop[0],'gradient stop',0)>1)throw new TypeError('Invalid gradient stop');const dst=out.stops[i]??[];dst[0]=stop[0];dst[1]=color(stop[1]);out.stops[i]=dst;});return out;
}
export function material(packet={},out={}){
    out.fill=paint(packet.fill===undefined?'#000':packet.fill,out.fill);out.stroke=paint(packet.stroke??null,out.stroke);out.stroke_width=finite(packet.stroke_width??1,'stroke width',0);
    out.line_cap=packet.line_cap??'butt';out.line_join=packet.line_join??'miter';if(!['butt','round','square'].includes(out.line_cap)||!['miter','bevel','round'].includes(out.line_join))throw new TypeError('Invalid line style');
    const dash=packet.dash??[];if(!Array.isArray(dash))throw new TypeError('Dash must be an array');out.dash??=[];out.dash.length=dash.length;dash.forEach((v,i)=>{out.dash[i]=finite(v,'dash length',0);});out.dash_offset=finite(packet.dash_offset??0,'dash offset');
    if(packet.shadow){out.shadow??={};out.shadow.color=color(packet.shadow.color);out.shadow.blur=finite(packet.shadow.blur??0,'shadow blur',0);out.shadow.offset=vector(packet.shadow.offset??[0,0],'shadow offset',out.shadow.offset);}else out.shadow=null;
    return out;
}
export function packet(input,out={}){
    if(!input||!['shape','sprite','text'].includes(input.type))throw new TypeError('Expected a shape, sprite or text packet');out.type=input.type;
    out.layer=finite(input.layer??0,'layer');out.depth=finite(input.depth??0,'depth');out.space=input.space??'world';if(!['world','screen'].includes(out.space))throw new TypeError('Invalid coordinate space');
    out.opacity=finite(input.opacity??1,'opacity',0);if(out.opacity>1)throw new TypeError('Opacity must be in [0,1]');out.blend=input.blend??'normal';if(!Object.hasOwn(BLENDS,out.blend))throw new TypeError('Unsupported blend');
    out.transform=transform(input,out.transform);out.material_id=input.material_id===undefined?null:identifier(input.material_id);out.material=out.material_id?null:material(input.material,out.material??{});
    out.geometry_id=null;out.geometry=null;out.resource_id=null;out.text=null;
    if(input.type!=='sprite'){out.size=null;out.source=null;out.origin=null;}
    if(input.type!=='text'){out.font=null;out.align=null;out.baseline=null;}
    if(input.type==='shape'){out.geometry_id=input.geometry_id===undefined?null:identifier(input.geometry_id);if(!out.geometry_id){out.geometry=geometry(input.geometry,geometryBuffers.get(out)??{});geometryBuffers.set(out,out.geometry);}}
    if(input.type==='sprite'){
        out.resource_id=identifier(input.resource_id);out.size=vector(input.size,'sprite size',out.size??[]);out.size.forEach(v=>finite(v,'sprite size',0));
        out.source=input.source?matrixSource(input.source,out.source??[]):null;
        out.origin=vector(input.origin??[.5,.5],'sprite origin',out.origin??[]);
    }
    if(input.type==='text'){
        if(typeof input.text!=='string')throw new TypeError('Text must be a string');out.text=input.text;
        const f=input.font??{};out.font??={};out.font.family=color(f.family??'sans-serif');out.font.size=finite(f.size??16,'font size',.01);out.font.weight=f.weight??400;out.font.style=f.style??'normal';out.font.letter_spacing=finite(f.letter_spacing??0,'letter spacing');
        if(![100,200,300,400,500,600,700,800,900,'normal','bold'].includes(out.font.weight)||!['normal','italic','oblique'].includes(out.font.style))throw new TypeError('Invalid font');
        out.align=input.align??'left';out.baseline=input.baseline??'alphabetic';if(!['left','center','right'].includes(out.align)||!['top','middle','bottom','alphabetic'].includes(out.baseline))throw new TypeError('Invalid text alignment');
    }
    const clips=input.clips??[];if(!Array.isArray(clips))throw new TypeError('Clips must be an array');out.clips??=[];out.clips.length=clips.length;
    clips.forEach((clip,i)=>{const dst=out.clips[i]??{};dst.geometry_id=clip.geometry_id===undefined?null:identifier(clip.geometry_id);dst.geometry=dst.geometry_id?null:geometry(clip.geometry,dst.geometry??{});dst.transform=matrix(clip.transform??[1,0,0,1,0,0],dst.transform);dst.inverse=inverse(dst.transform);dst.rule=clip.rule??'nonzero';if(!['nonzero','evenodd'].includes(dst.rule))throw new TypeError('Invalid clip rule');out.clips[i]=dst;});
    return out;
}
function matrixSource(source,out){if(!Array.isArray(source)||source.length!==4)throw new TypeError('Sprite source must be [x,y,width,height]');for(let i=0;i<4;i++)out[i]=finite(source[i],'sprite source',0);if(!out[2]||!out[3])throw new TypeError('Empty sprite source');return out;}
export function requirements(draw,resolve,result=[]){
    result.length=0;result.push(draw.type,`blend:${draw.blend}`);const g=draw.geometry_id?resolve(draw.geometry_id,'geometry').geometry:draw.geometry,m=draw.material_id?resolve(draw.material_id,'material').material:draw.material;
    if(g)result.push(`geometry:${g.type}`);if(draw.clips.length)result.push('clip');if(m.shadow)result.push('shadow');if(m.dash.length)result.push('dash');
    for(const p of [m.fill,m.stroke])if(p&&typeof p==='object')result.push(`gradient:${p.type}`);
    for(const clip of draw.clips){const g=clip.geometry_id?resolve(clip.geometry_id,'geometry').geometry:clip.geometry;result.push(`geometry:${g.type}`);}
    if(draw.resource_id&&resolve(draw.resource_id,['image','target']).type==='target')result.push('target');return result;
}
