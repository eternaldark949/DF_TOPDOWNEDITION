// The machines every map shares: MiniSpree's vending machine, Dr. Yin's health station, the loadout
// locker, a room's light switch and a note left lying. Their still bodies are pictures; what hums,
// glows, refills or runs across a screen is live. A light switch reads `piece.state.lit`.
import {rect,circle,polygon,linear} from '../../../engine/basement/rendering/index.mjs';
import {box} from './draw.mjs';

export const MACHINE_ARTISTS={
    mini_spree:{draw(art,piece,look){                                    // the city's vending brand: glossy black, a lit window of cans, a pink-and-cyan marquee
        const {width:w,height:h}=piece,wx=4,wy=13,ww=w-8,wh=h*.5,cw=(ww-8)/3;
        const hum=()=>.85+.15*Math.sin(piece.time*7)*Math.sin(piece.time*2.3);
        art.still(s=>box(s,0,0,w,h,4,look.body));
        art.live(s=>{const k=hum();s.enter({position:[w/2,h/2]});s.paint({type:'rect',size:[w-1,h-1],radius:4},{stroke:`rgba(62,240,255,${.55*k})`,stroke_width:1,shadow:{color:'#3ef0ff',blur:8*k}});s.leave();});   // the neon edge
        art.still(s=>{
            box(s,2,2,w-4,9,2,linear([-w/2,0],[w/2,0],[[0,look.marquee[0]],[1,look.marquee[1]]]));     // the marquee
            s.text(look.brand,w/2+2,6.8,{font:{family:'Montserrat, sans-serif',size:Math.max(5,Math.floor(w*.16)),weight:'bold'},align:'center',baseline:'middle'},{fill:'#ffffff'});
            const spark=[];for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?1:2.6;spark.push([6+Math.cos(a)*r,6.5+Math.sin(a)*r]);}s.fill(polygon(spark),'#fff6b0');   // the little spark
            s.fill(rect(wx,wy,ww,wh),'#10141e');                                                                  // the window of cans
            for(let row=0;row<3;row++)for(let i=0;i<3;i++){const cx=wx+2+i*(cw+2),cy=wy+2+row*(wh-4)/3;box(s,cx,cy,cw,(wh-4)/3-2,1.5,look.cans[i%look.cans.length]);s.fill(rect(cx+1,cy+1,1,(wh-4)/3-4),'rgba(255,255,255,0.35)');}
        });
        art.live(s=>s.fill(rect(wx,wy,ww,wh),`rgba(190,240,255,${.10*hum()})`));                                // the window's light
        art.still(s=>{
            const ky=wy+wh+3,keys=[];
            s.stroke([['move',wx+ww*.2,wy+wh],['line',wx+ww*.75,wy]],'rgba(255,255,255,0.18)',2);                // glass glint
            for(let i=0;i<6;i++)keys.push(...rect(6+(i%3)*4,ky+Math.floor(i/3)*4,2,2));s.fill(keys,'#3ef0ff');     // keypad, card slot, pickup tray
            s.fill(rect(w-12,ky,6,2),'#e8c27a');s.fill(rect(w-12,ky+4,6,1),'#ff4fa3');box(s,5,h-9,w-10,5,1.5,'#050508');
        });
    }},
    health_station:{draw(art,piece,look){                                // Dr. Yin's refill cabinet: white and wine, a green cross, a rack of stim vials, a vitals readout
        const {width:w,height:h}=piece,t=()=>piece.time,cx=w/2,cy=11,k=5,ry=20,rh=h*.34,n=5,vw=(w-10)/n,sy=ry+rh+3,sh=h-sy-5;
        art.still(s=>{box(s,0,0,w,h,4,look.body);box(s,1,1,w-2,h-2,4,null,look.trim,2);});
        art.live(s=>{const pulse=.7+.3*Math.sin(t()*2.5);s.paint([...rect(cx-k,cy-k*.35,k*2,k*.7),...rect(cx-k*.35,cy-k,k*.7,k*2)],{fill:look.cross,shadow:{color:'#00ff66',blur:10*pulse}});});   // the green cross, glowing
        art.still(s=>{s.fill(rect(4,ry,w-8,rh),'#d4d8de');const glass=[];for(let i=0;i<n;i++)glass.push(...rect(5+i*vw+.5,ry+2,vw-2,rh-4));s.fill(glass,'rgba(255,255,255,0.8)');});
        art.live(s=>{const levels=[];for(let i=0;i<n;i++){const lvl=.55+.45*(.5+.5*Math.sin(t()*.8+i*1.3));levels.push(...rect(5+i*vw+.5,ry+2+(rh-4)*(1-lvl),vw-2,(rh-4)*lvl));}s.fill(levels,look.vials);});   // the vials refilling
        art.still(s=>{const caps=[];for(let i=0;i<n;i++)caps.push(...rect(5+i*vw+.5,ry+1,vw-2,1.5));s.fill(caps,look.trim);box(s,4,sy,w-8,sh,2,'#0a1410');});
        art.live(s=>{                                                                                            // the vitals trace running across the screen
            const mid=sy+sh/2,ph=(t()*30)%(w-8),trace=[];
            for(let i=0;i<=w-8;i+=1){const q=(i+ph)%24,beat=q>8&&q<11?-sh*.35:q>11&&q<13?sh*.25:0;trace.push([i?'line':'move',4+i,mid+beat]);}
            s.stroke(trace,'#3cff8a',1);
        });
    }},
    loadout_locker:{draw(art,piece,look){                                // a wall-mounted weapons rack, pulsing violet: it can be opened
        const {width:w,height:h}=piece,pulse=()=>.5+Math.sin(piece.time*2)*.4;
        art.still(s=>{
            s.fill(rect(0,0,w,h),look.casing);s.fill(rect(3,3,w-6,h-6),look.panel);
            for(let i=0;i<3;i++){const by=10+i*(h-20)/3;s.fill(rect(8,by,w-16,3),'#444');s.fill(rect(12,by-2,5,7),'#444');}   // three guns, each with its grip
        });
        art.live(s=>{const k=pulse();
            s.paint(rect(2,2,w-4,h-4),{fill:`rgba(164, 105, 255, ${.1*k})`,shadow:{color:look.glow,blur:12*k}});
            s.text(look.label,w/2,h-5,{font:{family:'Orbitron',size:5,weight:'bold'},align:'center',baseline:'alphabetic'},{fill:`rgba(164, 105, 255, ${.5+k*.3})`});
        });
    }},
    light_switch:{draw(art,piece,look){art.still(s=>{                    // a wall plate with its rocker, the LED green while the room is lit
        const {width:w,height:h}=piece,lit=!!piece.state?.lit;
        s.fill(rect(0,0,w,h),'#1a1a1a');
        for(const edge of [rect(0,0,w,1),rect(0,0,1,h)])s.fill(edge,'rgba(255,255,255,0.06)');                 // lit along the top and left, shaded right and below
        for(const edge of [rect(w-1,0,1,h),rect(0,h-1,w,1)])s.fill(edge,'rgba(0,0,0,0.3)');
        s.fill(rect(2,3,w-4,h-6),'#2a2a2a');
        s.paint([circle(w/2,h-3,1.5)],{fill:lit?'#44ff88':'#ff3333',shadow:{color:lit?'rgba(68, 255, 136, 0.6)':'rgba(255, 51, 51, 0.4)',blur:6}});
    });}},
    plain_box:{draw(art,piece,look){art.still(s=>{                       // a plain block in its colour, lit along its top and shaded down its right side
        const {width:w,height:h}=piece;
        s.fill(rect(0,0,w,h),look.color);s.fill(rect(0,0,w,5),'rgba(255,255,255,0.1)');s.fill(rect(w-5,0,5,h),'rgba(0,0,0,0.3)');
    });}}
};
