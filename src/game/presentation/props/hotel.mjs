// The Double Nights hotel's furniture families: the lobby (dn_*) and the penthouse suite (ps_*), in
// the hotel's black marble, gold, silver and crimson velvet. Drawn on the art toolkit as the other
// venues' are. The lobby's floating seats hang and bob on a hover-glow, live; the suite is left as
// the Dark Maker left it (one glass drunk, the chess game unfinished, the wardrobe open).
import {rect,circle,ellipse,polyline,linear} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines,crescent,dots} from './draw.mjs';

const TAU=Math.PI*2;
const rects=list=>list.flatMap(([x,y,w,h])=>rect(x,y,w,h));
/** A wine glass from above: drunk (an empty bowl) or full. */
function glass(s,gx,gy,drunk,silver){disc(s,gx,gy,3,drunk?'rgba(255,240,220,0.35)':'rgba(150,20,40,0.85)',silver,.7);if(!drunk)disc(s,gx-.8,gy-.8,.8,'rgba(255,200,210,0.6)');}
const candle=(s,cx,cy,look)=>disc(s,cx,cy,2.2,look.wax,look.gold_dark,.5);
/** A crimson wax seal pressed with the crescent. */
function seal(s,cx,cy,r,inner,bite){disc(s,cx,cy,r,'#b8203a','#5a0a18',.8);s.fill(crescent(cx,cy,inner,cx+bite[0],cy+bite[1],bite[2]),'#ffd0d8');}

export const HOTEL_ARTISTS={
    // ----- The lobby ------------------------------------------------------------------------------
    rift_fountain:{draw(art,piece,look){                                 // black marble, water sheeting down a glass column round a turning rift
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,R=w/2;
        art.still(s=>{disc(s,cx,cy,R,look.basin,look.gold,2);disc(s,cx,cy,R-5,null,'rgba(223,230,255,0.35)',1);disc(s,cx,cy,R-8,look.water);});
        art.live(s=>{for(let i=0;i<3;i++){const ph=(piece.time*.45+i/3)%1;s.enter({},{opacity:1-ph});disc(s,cx,cy,22+ph*(R-32),null,'rgba(180,210,255,0.45)',1);s.leave();}});
        art.still(s=>disc(s,cx,cy,22,'rgba(200,220,255,0.10)','rgba(223,230,255,0.7)',1.5));   // the glass column
        art.live(s=>{
            s.enter({position:[cx,cy],rotation:(piece.time*.5)%TAU});
            for(let k=0;k<2;k++){
                s.place({rotation:Math.PI});
                const arm=[];for(let i=0;i<=20;i++){const a=i/20*Math.PI*1.4,r=3+i*.75;arm.push([Math.cos(a)*r,Math.sin(a)*r]);}
                s.stroke(polyline(arm),k?look.rift[0]:look.rift[1%look.rift.length],2.2);
            }
            s.leave();
        });
        art.still(s=>disc(s,cx,cy,3,'#fff6e0'));
    }},
    reception_desk:{draw(art,piece,look){art.still(s=>{                 // curved black marble, a gold edge; the bell, the ledger, the keys
        const {width:w,height:h}=piece,cx=w/2;
        s.outlined([['move',0,0],['quadratic',cx,h*.9,w,0],['line',w,h*.5],['quadratic',cx,h*1.5,0,h*.5],['close']],look.marble,look.gold,2.5);
        const veins=[];for(let i=0;i<5;i++)veins.push(['move',20+i*45,6],['quadratic',40+i*45,20,30+i*45,34]);s.stroke(veins,'rgba(223,230,255,0.22)',1);
        disc(s,34,12,5,look.gold,look.gold_light,1);disc(s,34,12,1.5,look.gold_light);
        box(s,cx-12,16,24,14,1,look.ledger,look.gold_dark,.8);s.fill(rect(cx-.5,16,1,14),look.ribbon);
        box(s,w-58,6,30,10,1,look.key_rack);for(let i=0;i<6;i++)disc(s,w-54+i*4.4,11,1.3,look.keys);
    });}},
    velvet_settee:{draw(art,piece,look){art.still(s=>{                  // buttoned red velvet on gold feet, the back to the north or south
        const {width:w,height:h}=piece,north=look.back==='N';
        box(s,0,0,w,h,10,look.velvet);
        box(s,2,north?0:h-16,w-4,16,8,look.velvet_dark);
        box(s,0,4,14,h-8,6,look.velvet_dark);box(s,w-14,4,14,h-8,6,look.velvet_dark);
        s.fill(dots([0,1,2,3,4].map(i=>[22+i*(w-44)/4,north?8:h-8,1.3])),'rgba(255,200,210,0.35)');
        box(s,16,north?18:6,(w-34)/2,h-26,5,look.seats);box(s,w/2+1,north?18:6,(w-34)/2,h-26,5,look.seats);
        s.fill(rects([[2,2,3,3],[w-5,2,3,3],[2,h-5,3,3],[w-5,h-5,3,3]]),look.feet);
    });}},
    wingback_chair:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,6,look.velvet);
        box(s,2,look.back==='S'?h-12:0,w-4,12,5,look.velvet_dark);box(s,0,4,8,h-8,4,look.velvet_dark);box(s,w-8,4,8,h-8,4,look.velvet_dark);
        box(s,10,8,w-20,h-20,4,look.seat);
    });}},
    cocktail_table:{draw(art,piece,look){art.still(s=>{                 // a marble top on gold legs: champagne and a vase
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,h/2,look.top,look.gold,2);
        s.stroke([['move',10,8],['quadratic',w/2,h*.7,w-12,10]],'rgba(120,110,130,0.35)',.8);
        disc(s,w*.3,h/2,3,'rgba(255,240,200,0.9)',look.gold,.8);disc(s,w*.42,h/2+3,3,'rgba(255,240,200,0.9)',look.gold,.8);   // flutes
        disc(s,w*.72,h/2,6,look.vase,look.gold,1);
        for(let i=0;i<5;i++)disc(s,w*.72+Math.cos(i*1.26)*4,h/2+Math.sin(i*1.26)*4,2,look.flowers[(i+1)%look.flowers.length]);
    });}},
    potted_palm:{loop:{period:2*Math.PI/.8,frames:10},pad:10,draw(art,piece,look){art.still(s=>{   // a palm in a gold urn, swaying a little
        const {width:w,height:h}=piece,cx=w/2,cy=h/2,L=w*.62;
        disc(s,cx,cy,w*.32,look.urn,look.gold,1.5);
        s.enter({},{line_cap:'round'});
        for(let i=0;i<7;i++){const a=i*.9+Math.sin(piece.time*.8+i)*.04;s.stroke([['move',cx,cy],['quadratic',cx+Math.cos(a+.3)*L*.6,cy+Math.sin(a+.3)*L*.6,cx+Math.cos(a)*L,cy+Math.sin(a)*L]],i%2?look.leaf_light:look.leaf,4);}
        s.leave();
    });}},
    floating_seat:{draw(art,piece,look){art.live(s=>{                   // a chaise or a chair hanging in the air: its hover-glow stays on the floor
        const {width:w,height:h}=piece,t=piece.time,x0=piece.seed[0];
        s.enter({},{opacity:.35+.1*Math.sin(t*3+x0)});s.fill([ellipse(w/2,h/2+2,w*.45,h*.35)],'rgba(232,194,122,0.5)');s.leave();
        s.enter({position:[0,Math.sin(t*1.6+x0*.05)*3-6]});
        if(look.style==='chaise'){
            box(s,0,0,w,h,12,look.frame,look.trim,1.2);
            box(s,4,4,w*.3,h-8,8,look.cushion);box(s,w*.34,6,w*.6,h-12,6,look.seat);
            s.fill(rect(12,2,w-24,1),'rgba(223,230,255,0.25)');
        }else{box(s,0,0,w,h,8,look.frame,look.trim,1.2);box(s,6,6,w-12,h-12,6,look.cushion);}
        s.leave();
    });}},

    // ----- The suite ------------------------------------------------------------------------------
    visitor_console:{draw(art,piece,look){art.still(s=>{                // by the elevator: the visitor book, a crescent seal
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.lacquer,look.gold,1.2);
        box(s,5,10,w-10,22,1,look.paper,look.gold_dark,.6);s.fill(rect(w/2-.5,10,1,22),look.ribbon);
        lines(s,[0,1,2,3].map(i=>[7,14+i*4,w/2-2,14+i*4]),'rgba(40,20,30,0.5)',.5);
        seal(s,w/2,h-18,5,2.6,[1.2,-.6,2.3]);
    });}},
    pit_sofa:{draw(art,piece,look){art.still(s=>{                       // one half of the round crimson pit, curving about the table
        const {width:w,height:h}=piece,up=piece.face==='N',cx=w/2;
        const band=(off,col)=>s.fill(up?[['move',off,0],['quadratic',cx,h*1.9-off*1.6,w-off,0],['line',w-18,0],['quadratic',cx,h*1.1,18,0]]
            :[['move',off,h],['quadratic',cx,-h*.9+off*1.6,w-off,h],['line',w-18,h],['quadratic',cx,-h*.1,18,h]],col);
        band(0,look.velvet_dark);band(6,look.velvet);band(12,look.seat);
        s.stroke(up?[['move',0,0],['quadratic',cx,h*1.9,w,0]]:[['move',0,h],['quadratic',cx,-h*.9,w,h]],look.gold,1);
        const buttons=[];for(let i=1;i<6;i++){const u=i/6,by=up?(h*1.9)*2*u*(1-u)*.9-4:h-(h*1.9)*2*u*(1-u)*.9+4;buttons.push([w*u,by,1.2]);}
        s.fill(dots(buttons),'rgba(255,200,210,0.35)');
    });}},
    pit_table:{draw(art,piece,look){art.still(s=>{                      // a black marble oval: a bottle, two glasses (one drunk), a folded note
        const {width:w,height:h}=piece;
        s.outlined([ellipse(w/2,h/2,w/2,h/2)],look.marble,look.gold,1.5);
        s.stroke([['move',12,14],['quadratic',w/2,h*.7,w-10,16]],'rgba(223,230,255,0.2)',.7);
        disc(s,w/2,h/2,4,'#1e3a24',look.gold,.8);glass(s,w/2-14,h/2+6,true,look.silver);glass(s,w/2+15,h/2-4,false,look.silver);
        box(s,w-22,h-16,12,8,1,look.note);
    });}},
    silver_grand:{pad:16,draw(art,piece,look){art.still(s=>{            // silver lacquer, the lid up, a page of music left open
        const {width:w,height:h}=piece,kw=(w*.5-4)/14;
        s.outlined([['move',0,8],['line',w*.55,8],['cubic',w*.9,6,w,h*.45,w*.8,h*.75],['cubic',w*.6,h,w*.2,h,6,h-6],['close']],linear([0,0],[w,h],[[0,'#e8ecf6'],[.5,'#a8aec0'],[1,'#6a7082']]),look.gold,1);
        lines(s,[[10,16,w*.72,h*.7]],'rgba(20,20,30,0.6)',1.5);       // the lid's prop
        box(s,0,0,w*.5,10,1,look.keybed);
        const white=[],black=[];for(let i=0;i<14;i++){white.push([2+i*kw,1,kw-.8,8]);if([1,2,4,5,6].includes(i%7))black.push([2+i*kw-1.2,1,2.4,5]);}
        s.fill(rects(white),'#f4f2ee');s.fill(rects(black),look.keybed);
        box(s,14,14,22,14,1,look.paper,look.gold_dark,.5);            // the music
        lines(s,[0,1,2,3].map(i=>[16,17+i*2.6,34,17+i*2.6]),'rgba(40,30,40,0.6)',.4);
        box(s,w*.18,-12,34,10,4,look.bench,look.gold,.8);
    });}},
    marble_fireplace:{draw(art,piece,look){                              // black marble, a gold fender, embers and burnt pages
        const {width:w,height:h}=piece;
        art.still(s=>{box(s,0,0,w,h,3,look.marble,look.gold,1.5);box(s,16,6,w-32,h-12,3,look.firebox);});
        art.live(s=>{for(let i=0;i<7;i++){const f=.6+.4*Math.sin(piece.time*6+i*1.9);disc(s,26+i*(w-52)/6,h/2+Math.sin(i)*3,3+f*1.5,`rgba(255,${90+60*f|0},40,${.55+.35*f})`);}});
        art.still(s=>{
            for(const [px,py,r] of [[38,12,.3],[w-52,15,-.4]]){s.enter({position:[px,py],rotation:r});box(s,0,0,12,8,1,'#3a2a20');s.fill(rect(0,7,12,1),'rgba(255,120,40,0.6)');s.leave();}
            lines(s,[[12,h-3,w-12,h-3]],look.gold,1.2);
        });
    }},
    wine_wall_bar:{draw(art,piece,look){art.still(s=>{                  // black lacquer against the west wall, a wine wall behind
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.lacquer,look.gold,1.2);
        for(let j=0;j<12;j++)for(let i=0;i<2;i++)disc(s,8+i*9,10+j*15,3,j%3?look.bottles[0]:look.bottles[1%look.bottles.length],'rgba(0,0,0,0.5)',.5);
        box(s,w-14,4,12,h-8,2,look.marble,look.gold_dark,.6);
        glass(s,w-8,40,false,look.silver);glass(s,w-8,h-50,true,look.silver);disc(s,w-8,h/2,3.6,'#e8f0ff',look.silver,.8);   // a decanter
    });}},
    dinner_for_two:{draw(art,piece,look){art.still(s=>{                 // a marble table: candles, the plates, one glass drunk and one not
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,8,look.top,look.gold,2);
        s.stroke([['move',12,10],['quadratic',w/2,h*.8,w-10,12]],'rgba(120,110,130,0.3)',.7);
        box(s,w/2-6,6,12,h-12,3,look.runner);
        for(const px of [18,w-18]){disc(s,px,h/2,10,'#fafafa',look.silver_dark,.8);disc(s,px,h/2,6.5,null,look.gold,.6);}
        disc(s,22,h/2+2,3.5,'rgba(120,20,30,0.5)');                     // his plate: a smear of sauce
        glass(s,30,14,true,look.silver);glass(s,w-30,h-14,false,look.silver);
        candle(s,w/2,18,look);candle(s,w/2,h-18,look);
        for(let i=0;i<4;i++)s.fill([ellipse(w/2-2+i*1.5,h/2-6+i*4,2,1.2,i)],look.petals);
    });}},
    velvet_dining_chair:{draw(art,piece,look){art.still(s=>{            // a gold frame; the back away from its face
        const {width:w,height:h}=piece,f=piece.face||'S';
        box(s,0,0,w,h,5,look.velvet,look.gold,1);
        const [bx,by,bw,bh]=f==='E'?[0,2,7,h-4]:f==='W'?[w-7,2,7,h-4]:f==='N'?[2,h-7,w-4,7]:[2,0,w-4,7];
        box(s,bx,by,bw,bh,3,look.velvet_dark);box(s,5,5,w-10,h-10,4,look.seat);
    });}},
    canopy_bed:{draw(art,piece,look){art.still(s=>{                     // black posts, crimson drapes, the covers thrown back
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,6,look.frame,look.gold,1.5);
        box(s,4,2,w-8,18,5,look.headboard,look.gold_dark,.8);
        box(s,10,22,w-20,h-30,6,look.sheets);
        box(s,18,26,60,26,10,look.pillows,'rgba(0,0,0,0.12)',.6);box(s,w-78,26,60,26,10,look.pillows,'rgba(0,0,0,0.12)',.6);
        s.fill([ellipse(w-60,46,22,9,.3)],'rgba(0,0,0,0.08)');          // one pillow slept on
        const fold=[['move',10,96],['cubic',w*.4,80,w*.6,118,w-10,104]];
        s.fill([...fold,['line',w-10,h-8],['line',10,h-8],['close']],look.cover);
        s.stroke(fold,look.cover_edge,3);
        s.stroke(rect(16,112,w-32,h-126),look.gold,.8);
        for(const [px,py] of [[3,3],[w-3,3],[3,h-3],[w-3,h-3]])disc(s,px,py,5,'#0e0a0e',look.gold,1.2);   // the posts
        for(const [px,dir] of [[3,1],[w-3,-1]])s.fill([['move',px,8],['quadratic',px+dir*16,h/2,px,h-8],['line',px+dir*4,h-8],['quadratic',px+dir*8,h/2,px+dir*4,8]],look.drapes);
    });}},
    window_chaise:{draw(art,piece,look){art.still(s=>{                  // a velvet chaise under the window, a gold cushion
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,12,look.frame,look.gold,1);
        box(s,4,4,22,h-8,9,look.velvet);box(s,28,6,w-34,h-12,7,look.seat);
        box(s,40,12,18,14,5,look.cushion);
    });}},
    writing_desk:{draw(art,piece,look){art.still(s=>{                   // chess mid-game, a crescent seal, candle stubs, the card rating his stay
        const {width:w,height:h}=piece,bx=10,by=10,sq=5;
        box(s,0,0,w,h,4,look.wood,look.gold,1.4);
        const grain=[];for(let gy=8;gy<h;gy+=6)grain.push([3,gy,w-3,gy]);lines(s,grain,'rgba(0,0,0,0.25)',.6);
        const light=[],dark=[];for(let i=0;i<8;i++)for(let j=0;j<8;j++)((i+j)%2?dark:light).push([bx+i*sq,by+j*sq,sq,sq]);
        s.fill(rects(light),'#e8e0d0');s.fill(rects(dark),'#1a1418');
        s.stroke(rect(bx,by,sq*8,sq*8),look.gold,.8);
        for(const [i,j,white] of [[1,6,1],[2,6,1],[4,4,1],[5,7,1],[3,1,0],[4,2,0],[6,1,0],[2,3,0],[6,5,1]])disc(s,bx+i*sq+sq/2,by+j*sq+sq/2,1.6,white?'#fff8ec':'#2a0a14',white?'#8a7a6a':'#b8203a',.5);
        disc(s,bx+sq*8+6,by+6,1.8,'#fff8ec','#8a7a6a',.5);             // a captured piece
        box(s,64,12,34,24,1,look.paper,look.gold_dark,.6);              // the card
        s.text(look.card_line_1,81,22,{font:{family:'Georgia, serif',size:8,weight:'bold'},align:'center',baseline:'middle'},{fill:look.ink});
        s.text(look.card_line_2,81,30,{font:{family:'Georgia, serif',size:4,style:'italic'},align:'center',baseline:'middle'},{fill:look.gold_dark});
        seal(s,110,40,4.5,2.4,[1.2,-.6,2.1]);
        for(const [cx,cy] of [[128,14],[138,20],[132,48]])candle(s,cx,cy,look);
        box(s,104,8,3,18,1,'#1a1a1e');disc(s,105.5,8,1.2,look.gold);    // a pen
    });}},
    open_wardrobe:{pad:16,draw(art,piece,look){art.still(s=>{           // standing open, empty hangers on the rail, the doors swung out
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.lacquer,look.gold,1.2);box(s,4,4,w-8,h-8,2,'#0a070a');
        lines(s,[[w/2,6,w/2,h-6]],look.silver_dark,1);
        for(let i=0;i<7;i++){const hy=14+i*19;s.stroke(polyline([[w/2-9,hy+3],[w/2,hy],[w/2+9,hy+3]]),look.gold,.8);}
        box(s,w-2,6,14,h*.45,2,look.doors,look.gold_dark,.8);box(s,w-2,h*.52,14,h*.45,2,look.doors,look.gold_dark,.8);
    });}},
    round_tub:{draw(art,piece,look){                                     // round marble, rose petals drifting slowly round
        const {width:w,height:h}=piece;
        art.still(s=>{disc(s,w/2,h/2,w/2,look.marble,look.gold,1.5);disc(s,w/2,h/2,w/2-7,look.water);});
        art.live(s=>{for(let i=0;i<8;i++){const a=i*.8+piece.time*.05,r=10+(i*7)%22;s.fill([ellipse(w/2+Math.cos(a)*r,h/2+Math.sin(a)*r,2.6,1.6,a)],look.petals[i%2?0:1%look.petals.length]);}});
        art.still(s=>box(s,w/2-4,-1,8,6,2,look.gold));                 // the spout
    }},
    basin_vanity:{draw(art,piece,look){art.still(s=>{                   // marble along the east wall, a basin, a perfume
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.marble,look.gold_dark,1);
        s.outlined([ellipse(w/2,h/2,7,11)],look.basin,look.silver_dark,.6);
        disc(s,w/2,10,2.6,'#e8b4c8',look.gold,.5);disc(s,w/2,h-10,2.2,look.gold);
    });}},
    plunge_pool:{draw(art,piece,look){                                   // a tiled edge, water with a slow ripple, the ladder
        const {width:w,height:h}=piece;
        art.still(s=>{box(s,0,0,w,h,10,look.tiles,look.gold,1.2);box(s,6,6,w-12,h-12,7,linear([0,-h/2],[0,h/2],[[0,look.water[0]],[1,look.water[1%look.water.length]]]));});
        art.live(s=>{for(let k=0;k<5;k++){const pts=[];for(let i=0;i<=20;i++)pts.push([10+i*(w-20)/20,14+k*(h-28)/4+Math.sin(i*.9+piece.time*1.6+k)*2]);s.stroke(polyline(pts),'rgba(160,230,255,0.35)',.8);}});
        art.still(s=>lines(s,[[w-18,3,w-18,14],[w-12,3,w-12,14]],look.ladder,1.2));
    }},
    pool_lounger:{draw(art,piece,look){art.still(s=>{                   // a white lounger, a folded towel
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,6,look.frame,look.gold_dark,1);
        box(s,3,3,w-6,24,5,look.cushion);
        const slats=[];for(let ly=32;ly<h-4;ly+=6)slats.push([4,ly,w-4,ly]);lines(s,slats,'rgba(0,0,0,0.12)',.6);
        box(s,6,h-22,w-12,14,2,look.towel);
    });}},
    trained_telescope:{pad:11,draw(art,piece,look){art.still(s=>{       // brass on a tripod, trained on the sky
        const {width:w,height:h}=piece;
        lines(s,[.4,2.5,4.6].map(a=>[w/2,h/2,w/2+Math.cos(a)*13,h/2+Math.sin(a)*13]),look.tripod,1.5);
        s.enter({position:[w/2,h/2],rotation:-2.2});box(s,-3,-3,24,6,3,look.tube,look.tube_dark,.8);box(s,18,-4,6,8,2,look.tube_dark);s.leave();
    });}}
};
