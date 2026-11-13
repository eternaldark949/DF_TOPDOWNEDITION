// The Sanctum's furniture families (sc_*): weathered stone, black iron, crimson cloth, candle wax,
// rain-dark and mossed. Drawn on the art toolkit as the other venues' are; candle flames and the
// brazier's coals are live. The colonnade's pillars are the cover the Triumvirate's fire respects.
import {rect,circle,ellipse,linear,radial} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines} from './draw.mjs';

const TAU=Math.PI*2;
/** Moss on stone: n tufts round (mx, my), their spread seeded by `phase` (the classic art's world x). */
function moss(s,mx,my,n,R,phase){
    for(let i=0;i<n;i++){const a=i*2.4+phase,r=R*(.3+((i*37)%10)/14);s.fill([circle(mx+Math.cos(a)*r,my+Math.sin(a)*r,1.4+(i%3)*.6)],`rgba(${60+(i*13)%30},${90+(i*17)%30},60,0.5)`);}
}
/** A candle's wax top, still. */
const wax=(s,fx,fy,look)=>disc(s,fx,fy,1.8,look.wax);
/** Its flame, live: flickering with the time, seeded by where it stands. */
function flame(s,piece,fx,fy,k){const f=.75+.25*Math.sin(piece.time*11+(piece.seed[0]+fx)*.3+k);disc(s,fx,fy-.5,1.4*f,`rgba(255,${190+40*f|0},110,0.95)`);}
/** One length of column, lying along x, about its middle. */
function drum(s,sw,h,tilt,cx,look){
    s.enter({position:[cx,h/2],rotation:tilt});
    box(s,-sw/2,-h/2,sw,h,6,linear([0,-h/2],[0,h/2],[[0,look.stone_light],[.5,look.stone],[1,look.stone_dark]]),look.edge,1);
    const flutes=[];for(let k=-sw/2+6;k<sw/2;k+=7)flutes.push([k,-h/2+3,k,h/2-3]);lines(s,flutes,'rgba(20,16,24,0.4)',.7);
    s.leave();
}
/** A pew's length of dark wood, its seat board and grain. */
function pewWood(s,X,W,h,look){
    box(s,X,0,W,h,2,look.wood,look.wood_edge,1);box(s,X+2,2,W-4,7,1.5,look.seat);
    const grain=[];for(let k=12;k<h-2;k+=4)grain.push([X+2,k,X+W-2,k]);lines(s,grain,'rgba(0,0,0,0.3)',.6);
}

export const SANCTUM_ARTISTS={
    stone_column:{draw(art,piece,look){art.still(s=>{                   // a round stone column from above: capital, fluting, moss
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,R=w/2;
        s.outlined([circle(cx,cy,R)],radial([cx-R*.35,cy-R*.35],2,[cx,cy],R,[[0,look.stone_light],[.7,look.stone],[1,look.stone_dark]]),look.edge,1.2);
        const flutes=[];for(let i=0;i<12;i++){const a=i*Math.PI/6;flutes.push([cx+Math.cos(a)*R*.55,cy+Math.sin(a)*R*.55,cx+Math.cos(a)*R*.95,cy+Math.sin(a)*R*.95]);}
        lines(s,flutes,'rgba(20,16,24,0.45)',.8);
        disc(s,cx,cy,R*.5,look.capital,'rgba(200,180,255,0.18)',1);
        moss(s,cx+R*.3,cy+R*.4,7,R*.5,piece.seed[0]+cx+R*.3);
    });}},
    fallen_column:{draw(art,piece,look){art.still(s=>{                  // a toppled column in pieces across the aisle
        const {width:w,height:h}=piece;
        drum(s,w*.45,h,-.06,w*.45/2,look);drum(s,w*.5,h,.08,w*.5+w*.5/2,look);
        for(let i=0;i<6;i++)disc(s,w*.47+(i%3)*3-3,h+3+(i/3|0)*3,2,look.rubble);   // rubble
        moss(s,w*.2,h*.4,6,8,piece.seed[0]+w*.2);
    });}},
    chapel_pew:{draw(art,piece,look){art.still(s=>{                     // a dark wooden pew; a broken one snapped and splintered
        const {width:w,height:h}=piece;
        if(!look.broken){pewWood(s,0,w,h,look);return;}
        pewWood(s,0,w*.45,h,look);
        s.enter({position:[w*.72,h/2],rotation:.35});s.enter({position:[0,-h/2]});pewWood(s,-w*.25,w*.45,h,look);s.leave();s.leave();
        s.stroke([['move',w*.45,2],['line',w*.5,6],['line',w*.45,10]],look.splinter,1);
    });}},
    ring_altar:{draw(art,piece,look){                                   // black stone, a crimson cloth, a gold chalice, candles guttering
        const {width:w,height:h}=piece,candles=[[w-16,12],[w-24,20],[w-12,h-12],[10,10],[12,h-10]];
        art.still(s=>{
            box(s,0,0,w,h,3,look.stone,look.trim,1.5);
            box(s,w*.2,-2,w*.6,h+4,2,look.cloth);s.fill(rect(w*.2,h-3,w*.6,1.5),look.gold);s.fill(rect(w*.2,-2,w*.6,1.5),look.gold);
            s.enter({position:[w/2,h/2]},{opacity:.7});                 // the three rings, stitched
            for(let k=0;k<3;k++){const a=-Math.PI/2+k*TAU/3;s.stroke([circle(Math.cos(a)*5,Math.sin(a)*5,6)],look.gold,1);}
            s.leave();
            disc(s,20,h/2,5,look.gold,look.trim,1);disc(s,20,h/2,2.4,look.wine);   // the chalice
            for(const [cx,cy] of candles)wax(s,cx,cy,look);
        });
        art.live(s=>candles.forEach(([cx,cy],k)=>flame(s,piece,cx,cy,k)));
    }},
    ruined_organ:{draw(art,piece,look){art.still(s=>{                   // a ruined pipe organ: a rank of pipes, some fallen
        const {width:w,height:h}=piece;
        box(s,0,h*.55,w,h*.45,2,look.case,look.trim,1);
        for(let i=0;i<11;i++){
            if(i===3||i===8)continue;                                   // two gone from the rank
            const px=5+i*(w-10)/10,r=3.2-Math.abs(i-5)*.18;
            s.outlined([circle(px,10+Math.abs(i-5)*1.2,r)],radial([px-1,9],.5,[px,10],r,[[0,look.pipe_light],[1,look.pipe]]),look.pipe_edge,.6);
        }
        s.enter({position:[w*.35,h*.3],rotation:1.1});box(s,-2,0,4,22,2,look.fallen_pipe,look.pipe_edge,.6);s.leave();
    });}},
    candle_stand:{draw(art,piece,look){                                 // an iron stand of pillar candles, wax spilled
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,candles=[[-4,-3],[4,-2],[0,4]];
        art.still(s=>{
            disc(s,cx,cy,w/2+1,look.iron,look.rim,1);
            s.fill([ellipse(cx+3,cy+5,6,3,.4)],'rgba(230,221,208,0.5)');
            for(const [dx,dy] of candles)wax(s,cx+dx,cy+dy,look);
        });
        art.live(s=>candles.forEach(([dx,dy],k)=>flame(s,piece,cx+dx,cy+dy,k)));
    }},
    coal_brazier:{draw(art,piece,look){                                 // an iron bowl of coals on three legs, burning
        const {width:w,height:h}=piece,cx=w/2,cy=h/2;
        art.still(s=>{
            const legs=[];for(let k=0;k<3;k++){const a=k*TAU/3+.5;legs.push(['move',cx,cy],['line',cx+Math.cos(a)*(w/2+3),cy+Math.sin(a)*(w/2+3)]);}
            s.stroke(legs,look.iron,2);
            disc(s,cx,cy,w/2-2,look.bowl,look.rim,1.5);
        });
        art.live(s=>{for(let i=0;i<9;i++){const a=i*2.4,r=(i%3)*3.5+2,f=.6+.4*Math.sin(piece.time*7+i*1.9);disc(s,cx+Math.cos(a)*r,cy+Math.sin(a)*r,2.6+f,`rgba(255,${80+90*f|0},30,${.6+.35*f})`);}});
    }}
};
