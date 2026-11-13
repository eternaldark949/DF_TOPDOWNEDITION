// The Demoness Palace's furniture families (dp_*): obsidian, blood-red velvet and gold, her throne
// and her pool of blood, the rose beds, the braziers. Drawn on the art toolkit as the other venues'
// are; the pool's ripples, the flames, the embers and the altar's floating crystal are live.
import {rect,circle,ellipse,polygon,radial} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,classicRandom} from './draw.mjs';

const TAU=Math.PI*2,GOLD='#ffc64b',GOLD_DIM='rgba(255,190,58,0.65)';
const drop=(s,w,h,r=4)=>box(s,3,3,w,h,r,'rgba(0,0,0,0.4)');
/** A rose bed's flowers, scattered as the classic art scattered them from where the bed stands. */
function flowers(piece){
    const {width:w,height:h,seed:[x,y]}=piece,rnd=classicRandom((x*31+y)|0),out=[],count=Math.max(12,Math.floor(w*h/280));
    const cols=Math.max(2,Math.round(Math.sqrt(count*w/h))),rows=Math.ceil(count/cols);
    for(let i=0;i<count;i++)out.push({x:8+((i%cols)+.2+rnd()*.6)*(w-16)/cols,y:7+(Math.floor(i/cols)+.2+rnd()*.6)*(h-14)/rows,r:3+rnd()*2,a:rnd()*6.28,blood:i%4===0,gold:i%4!==0&&i%5===2});
    return out;
}
export const PALACE_ARTISTS={
    obsidian_throne:{pad:30,draw(art,piece,look){art.still(s=>{         // obsidian ribs sweeping round a ruby, over the upholstered seat
        const {width:w,height:h}=piece,cx=w/2;
        drop(s,w,h,10);box(s,-4,-2,w+8,h+6,12,look.obsidian,look.gold,1.4);
        box(s,5,8,w-10,h-12,8,look.velvet,'#f4b94c',1);
        for(const side of [-1,1]){
            s.paint([['move',cx+side*7,8],['cubic',cx+side*32,4,cx+side*39,-15,cx+side*34,-25],['quadratic',cx+side*21,-8,cx+side*5,13]],{fill:'#322436',stroke:'#ffd06b',stroke_width:1.1});
            box(s,cx+side*24-4,20,8,27,3,'#44303f','#d5a03e',1);
        }
        s.outlined(polygon([[cx,-22],[cx+8,-4],[cx,8],[cx-8,-4]]),look.ruby,'#ffda77',1);
        s.fill(polygon([[cx,-18],[cx,4],[cx-5,-4]]),look.ruby_light);
    });}},
    blood_pool:{pad:12,draw(art,piece,look){                            // a gold rim, the pool sunk below the floor, petals drifting, ripples
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{
            box(s,-7,-7,w+14,h+14,33,'#2a1018',look.gold,2);box(s,-3,-3,w+6,h+6,29,null,'rgba(255,220,150,.45)',1);
            box(s,0,0,w,h,26,radial([-18-0,-12],6,[0,0],w*.62,[[0,look.blood[0]],[.45,look.blood[1%look.blood.length]],[1,look.blood[2%look.blood.length]]]));
            box(s,2,2,w-4,h-4,24,null,'rgba(0,0,0,.55)',5);
        });
        art.live(s=>{
            const R=classicRandom(31),t=piece.time;
            for(let i=0;i<9;i++){const px=22+R()*(w-44),py=18+R()*(h-36)+Math.sin(t*.6+i)*2,a=R()*6.28+t*.05;s.fill([ellipse(px,py,3,1.6,a)],i%3?'#e0143e':'#ff5070');}
            for(let i=0;i<3;i++){const k=(t*.3+i/3)%1;s.enter({},{opacity:1-k});s.stroke([ellipse(cx,cy,10+k*60,6+k*36)],'rgba(255,150,150,0.2)',1);s.leave();}
        });
    }},
    obsidian_pillar:{pad:12,draw(art,piece,look){                       // obsidian, gold studs, a blood-red arc creeping round
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{
            disc(s,cx+4,cy+5,w/2+2,'rgba(0,0,0,0.5)');
            s.outlined([circle(cx,cy,w/2)],radial([cx-w*.18,cy-w*.18],2,[cx,cy],w/2,[[0,'#5a2232'],[.6,'#2a0c16'],[1,'#0c0307']]),look.gold,1.6);
            disc(s,cx,cy,w/2-6,null,'rgba(255,200,100,.35)');
            for(let i=0;i<8;i++){const a=i*Math.PI/4;disc(s,cx+Math.cos(a)*(w/2-3),cy+Math.sin(a)*(w/2-3),1.2,'#ffd36a');}
        });
        art.live(s=>{const a=piece.time*.2;s.stroke([circle(cx,cy,w/2-3,a,a+4)],'rgba(176,18,46,0.6)',1.5);});
    }},
    gold_brazier:{pad:12,draw(art,piece,look){                          // a gold bowl of coals on three legs, burning
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{
            disc(s,cx+3,cy+4,w/2+1,'rgba(0,0,0,0.5)');
            for(let i=0;i<3;i++){const a=i*2.094+.5;s.stroke([['move',cx+Math.cos(a)*9,cy+Math.sin(a)*9],['line',cx+Math.cos(a)*(w/2+4),cy+Math.sin(a)*(w/2+4)]],look.gold,1.6);}
            s.outlined([circle(cx,cy,w/2)],radial([cx,cy],2,[cx,cy],w/2,[[0,'#ff8a3a'],[.5,'#8a1a08'],[1,'#2a0a06']]),look.gold,1.6);
        });
        art.live(s=>{const f=.7+.3*Math.sin(piece.time*13+piece.seed[0]+cx);disc(s,cx,cy,8*f,'#ff6a2a');disc(s,cx,cy,4*f,'#ffe6a8');});
    }},
    blood_fountain:{draw(art,piece,look){                               // a stone basin, the spout throwing six arcs of blood, turning
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{disc(s,cx,cy,w/2,'#68505d','#efc366',2);disc(s,cx,cy,w/2-8,'#302234');disc(s,cx,cy,10,'#2a1018',look.gold,1.2);});
        art.live(s=>{for(let i=0;i<6;i++){const a=i*Math.PI/3+piece.time*.4;s.stroke([['move',cx+Math.cos(a)*10,cy+Math.sin(a)*10],['quadratic',cx+Math.cos(a)*24,cy+Math.sin(a)*24-6,cx+Math.cos(a)*32,cy+Math.sin(a)*32]],'rgba(255,106,129,0.7)',1.2);}});
    }},
    rose_bed:{pad:10,draw(art,piece,look){art.still(s=>{                // a gold-edged bed of roses: crimson, gold and the blood roses that glow
        const {width:w,height:h}=piece;
        drop(s,w,h,12);box(s,-1,-1,w+2,h+2,13,'#2a1820');box(s,0,0,w,h,12,'#5a3a44','#ffc44f',1.4);
        box(s,4,4,w-8,h-8,9,'#170c10','rgba(255,190,150,.22)');
        for(const f of flowers(piece)){
            const px=f.x,py=f.y;
            s.fill([ellipse(px-2,py+2,f.r*1.6,f.r*.75,f.a)],f.blood?'#2f6a4c':'#2a7040');
            s.fill([ellipse(px+2,py+3,f.r*1.1,f.r*.5,f.a+1.4)],'#1c4a2c');
            s.stroke([['move',px-3,py+4],['line',px+1,py-1]],'#7fa070',.6);
            for(let j=0;j<6;j++){const a=f.a+j*Math.PI/3;s.fill([ellipse(px+Math.cos(a)*f.r*.5,py+Math.sin(a)*f.r*.5,f.r*.75,f.r*.42,a)],f.gold?(j%2?'#ff9a1a':'#ffd25a'):f.blood?(j%2?'#e80c44':'#ff4468'):(j%2?'#b30a30':'#ff1f4e'));}
            disc(s,px,py,f.r*.4,f.gold?'#8a2a08':f.blood?'#ffd09a':'#680b25');
            if(!f.blood&&!f.gold)s.stroke([circle(px,py,f.r*.52,f.a,f.a+3.8)],'#ff6a82',.55);
        }
    });}},
    velvet_bench:{pad:10,draw(art,piece,look){art.still(s=>{            // a gold-edged bench in blood velvet
        const {width:w,height:h}=piece;
        drop(s,w,h,5);box(s,0,0,w,h,5,'#5a4751',look.gold,1.3);box(s,8,4,w-16,h-8,3,look.velvet,'#db3856');
        for(const dx of [3,w-8])box(s,dx,2,5,h-4,2,'#ad8c69');
    });}},
    ruby_altar:{pad:30,draw(art,piece,look){                         // a stone altar: two cradles, red-black filaments, a ruby floating over it
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{drop(s,w,h,12);box(s,0,0,w,h,12,'#352738','#c2a080',1.4);box(s,7,6,w-14,h-12,9,'#543349','rgba(225,179,147,.45)');});
        art.live(s=>{
            const bob=Math.sin(piece.time*1.1)*2;
            for(const side of [-1,1]){disc(s,cx+side*32,cy+5,7,'#3d293d','#d3b28b');s.stroke([['move',cx+side*30,cy+2],['cubic',cx+side*19,cy-13,cx+side*15,cy+12,cx,cy+bob]],'rgba(232,30,77,.65)',1);}
            s.outlined(polygon([[cx,cy-24+bob],[cx+13,cy-1+bob],[cx,cy+23+bob],[cx-13,cy-1+bob]]),look.ruby,'#ffd570',1);
            s.fill(polygon([[cx,cy-20+bob],[cx,cy+17+bob],[cx-9,cy-1+bob]]),look.ruby_light);
        });
    }},
    shard_statue:{pad:10,draw(art,piece,look){art.still(s=>{            // a round plinth, three stone shards standing on it
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        drop(s,w,h,10);disc(s,cx,cy,w/2,'#493540','#b39172');
        for(const [dx,dy,k] of [[-5,1,.65],[5,4,.55],[0,-4,1]])s.outlined(polygon([[cx+dx,cy+dy-11*k],[cx+dx+6*k,cy+dy],[cx+dx,cy+dy+9*k],[cx+dx-5*k,cy+dy]]),dx<0?'#756072':dx>0?'#442c47':'#987c91','#c6a28f',.7);
    });}},
    ember_bed:{pad:12,draw(art,piece,look){                             // a sunk bed of embers, glowing and sparking
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{box(s,-4,-4,w+8,h+8,24,'#2a0e08',GOLD_DIM,2);box(s,0,0,w,h,20,radial([0,0],10,[0,0],Math.max(w,h)/2,[[0,'#ff8a3a'],[.5,'#b0300a'],[1,'#3a0a04']]));});
        art.live(s=>{const R=classicRandom(17),t=piece.time;for(let i=0;i<40;i++){const px=10+R()*(w-20),py=10+R()*(h-20),f=.5+.5*Math.sin(t*(3+R()*4)+i);disc(s,px,py,1.5+R()*2,`rgba(255,${180+(f*60|0)},120,${.4+.5*f})`);}});
    }},
    gilt_mirror:{draw(art,piece,look){art.still(s=>{                    // a gilt wall mirror
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,'#e3a64a');box(s,3,3,w-6,h-6,2,'rgba(200,190,220,0.5)');s.fill(rect(8,4,12,2),'rgba(255,255,255,0.4)');
    });}},
    palace_vanity:{pad:10,draw(art,piece,look){art.still(s=>{           // her vanity: powder, gold, a lipstick
        const {width:w,height:h}=piece;
        drop(s,w,h);box(s,0,0,w,h,5,'#2a0c16',GOLD_DIM,1.2);disc(s,20,h/2,5,'#ff8aa8');disc(s,40,h/2,4,'#e3a64a');disc(s,60,h/2-4,3,'#b0122e');
    });}},
    palace_wardrobe:{pad:10,draw(art,piece,look){art.still(s=>{         // a lacquer wardrobe, gold-edged
        const {width:w,height:h}=piece;
        drop(s,w,h);box(s,0,0,w,h,4,'#1a0710',look.gold,1.2);s.fill(rect(w/2-1,3,2,h-6),GOLD_DIM);
    });}},
    iron_cage:{pad:10,draw(art,piece,look){art.still(s=>{               // a rusted iron cage
        const {width:w,height:h}=piece;
        drop(s,w,h);box(s,0,0,w,h,4,'rgba(20,8,6,0.8)');
        for(let i=0;i<=8;i++){const px=i*w/8;s.stroke([['move',px,0],['line',px,h]],'#6a3a1a',1.6);}
        box(s,0,0,w,h,4,null,'#8a4a2a',2);
    });}}
};
