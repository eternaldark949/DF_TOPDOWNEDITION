// Lost things round the city: a case, a coat, a purse, a cash tin, searched once a day for what is
// in them. Each is drawn closed and full, or lying open and emptied once `piece.state.searched` (its
// host sets it; the open and the closed piece are kept as separate pictures).
import {rect,circle,ellipse} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,crescent} from './draw.mjs';

const GOLD='#e8c27a',GOLD_DARK='#a8823e',CREAM='#f3e6c8',CRIMSON_LIGHT='#b8203a';
const STASH_GOLD='#e8c26a',STASH_GOLD_DARK='#9a7a32';
const searched=piece=>!!piece.state?.searched;
/** The soft shadow a small stash casts on the floor below its front edge. */
const pool=(s,w,h)=>s.fill([ellipse(w/2+1.5,h+1,w*.55,2.4)],'rgba(0,0,0,0.28)');
/** A run of banknotes, each a little higher than the last. */
const bills=(s,x,y,n)=>{for(let i=0;i<n;i++)box(s,x+i*3,y-i,7,4,.8,i%2?'#8fc89a':'#6fb07e','rgba(20,50,30,0.5)',.4);};

export const LOST_ARTISTS={
    hard_case:{draw(art,piece,look){                                    // a hard case, its luggage tag swinging; open (and empty) once searched
        const {width:w,height:h,seed:[x]}=piece,open=searched(piece);
        art.still(s=>{
            box(s,0,0,w,h,3,look.shell,GOLD,1);
            if(open){box(s,-2,-h*.55,w+4,h*.55,3,'#2a1e38',GOLD_DARK,1);box(s,3,3,w-6,h-6,2,'#1a1224');}
            else s.fill([...rect(w/2-4,-2,8,3),...rect(4,h/2-.5,w-8,1)],GOLD);
        });
        if(!open)art.live(s=>{s.enter({position:[w-4,2],rotation:.6+Math.sin(piece.time*2+x)*.2});s.fill(rect(0,0,5,8),CREAM);s.leave();});
    }},
    monogram_case:{draw(art,piece,look){art.still(s=>{                  // a monogrammed case left open; rifled, its shirts tipped out
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,'#3a2418',GOLD,1);box(s,-1,-h*.62,w+2,h*.6,3,'#4a2e1e',GOLD,1);     // the open lid
        s.text(look.monogram,w/2,-h*.32,{font:{family:'Georgia, serif',size:7,weight:'bold'},align:'center',baseline:'middle'},{fill:GOLD});
        box(s,3,3,w-6,h-6,2,look.lining);
        if(!searched(piece)){box(s,6,6,18,12,2,'#f4efe8');box(s,26,8,18,10,2,'#1a1a22');s.fill([['move',10,h-6],['line',40,h-10],['line',40,h-7],['close']],CRIMSON_LIGHT);disc(s,16,h-12,1.3,GOLD);disc(s,20,h-12,1.3,GOLD);}
        else{box(s,8,h+2,20,8,2,'#f4efe8','rgba(0,0,0,0.3)',.5);s.fill(rect(w-6,h-2,14,2.5),CRIMSON_LIGHT);}
    });}},
    sequin_clutch:{draw(art,piece,look){                                // a sequined envelope clutch on a gold chain, the sequins catching the light
        const {width:w,height:h,seed:[x]}=piece,open=searched(piece);
        art.still(s=>{s.stroke([['move',2,2],['quadratic',w/2,-7,w-2,2]],GOLD,.8);box(s,0,0,w,h,2,look.leather,GOLD_DARK,.8);});
        art.live(s=>{for(let i=0;i<9;i++){const tw=.5+.5*Math.sin(piece.time*5+i*2+x);s.enter({},{opacity:.3+.7*tw});s.fill(rect(2+(i*7)%(w-4),2+(i*5)%(h-4),1,1),'rgba(255,235,250,0.55)');s.leave();}});
        art.still(s=>{
            if(open)s.fill([['move',1,1],['line',w-1,1],['line',w/2,h*.75],['close']],'#12080e');
            else{s.fill([['move',0,0],['line',w/2,h*.6],['line',w,0]],'rgba(0,0,0,0.3)');disc(s,w/2,h*.6,1.4,GOLD);}
        });
    }},
    fur_coat:{draw(art,piece,look){art.still(s=>{                       // a coat with a fur collar draped over the bench; its pockets turned out once searched
        const {width:w,height:h}=piece;
        s.fill([['move',4,4],['line',w-4,4],['line',w,h],['line',0,h],['close']],look.cloth);
        s.stroke([['move',w/2,6],['line',w/2,h-1]],'rgba(0,0,0,0.35)',.8);
        box(s,1,h-8,7,10,3,look.sleeve);box(s,w-8,h-8,7,10,3,look.sleeve);                           // sleeves over the edge
        for(let i=0;i<9;i++)disc(s,4+i*(w-8)/8,4+Math.sin(i*1.7)*1.2,2.6,i%2?'#e8dcd0':'#cfc2b6');    // the fur collar
        disc(s,w/2+3,11,1,GOLD);disc(s,w/2+3,17,1,GOLD);
        if(searched(piece))for(const px of [7,w-12])box(s,px,h-11,6,5,1.5,'#d8cce0','rgba(0,0,0,0.4)',.5);
    });}},
    velvet_purse:{draw(art,piece,look){art.still(s=>{                   // quilted velvet, a gold crescent clasp; open and empty once searched
        const {width:w,height:h}=piece,quilt=[];
        box(s,0,0,w,h,4,look.velvet,GOLD_DARK,.8);
        s.enter({position:[w/2,h/2]});s.clip({type:'rect',size:[w,h],radius:4});s.enter({position:[-w/2,-h/2]});   // the quilting, inside the purse
        for(let k=-h;k<w;k+=5)quilt.push(['move',k,0],['line',k+h,h],['move',k+h,0],['line',k,h]);
        s.stroke(quilt,'rgba(60,0,20,0.4)',.6);s.leave();s.leave();
        if(searched(piece)){box(s,-1,-h*.5,w+2,h*.55,3,look.flap,GOLD_DARK,.6);box(s,2,2,w-4,h-4,2,'#2a0614');}
        else{box(s,1,0,w-2,h*.45,3,look.flap);s.fill(crescent(w/2,h*.45,2.4,w/2+1,h*.45-.6,1.9),GOLD);}
    });}},
    chain_handbag:{draw(art,piece,look){art.still(s=>{                  // black patent on a gold chain strap
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.patent,'#4a4458',.8);s.fill(rect(2,2,w-6,1.2),'rgba(255,255,255,0.22)');     // the patent shine
        s.enter({},{dash:[1.5,1]});s.stroke([['move',2,2],['cubic',-6,h+6,w+6,h+6,w-2,2]],GOLD,.9);s.leave();
        if(searched(piece))box(s,2,2,w-4,h-5,2,'#2a2436');else box(s,w/2-3,h*.35,6,3,1,GOLD);
    });}},
    canvas_tote:{draw(art,piece,look){art.still(s=>{                    // a canvas tote, a paperback and a knitted scarf poking out
        const {width:w,height:h}=piece;
        pool(s,w,h);s.stroke([['move',4,2],['quadratic',w/2,-7,w-4,2]],'#a8916c',1.4);
        box(s,0,1,w,h-1,2,'#e9dcc2','#a8916c',.8);box(s,3,4,w-6,5,1,look.stamp);                    // the cafe's stamp
        if(searched(piece)){box(s,2,2,w-4,h-5,1.5,'#4a3a2a');box(s,w-3,h-4,9,4,1.5,'#b9446a');}      // emptied, the scarf trailing out
        else{box(s,2,-2,7,5,1,'#3d6a8a','#22384a',.5);box(s,8,-3,7,5,2,'#b9446a');}
    });}},
    cash_tin:{draw(art,piece,look){art.still(s=>{                       // a dented steel cash box, grease on the lid
        const {width:w,height:h}=piece;
        pool(s,w,h);box(s,0,0,w,h,2,'#6c7480','#2c3038',.9);
        if(searched(piece)){box(s,0,-h*.55,w,h*.55,2,'#7d8592','#2c3038',.8);box(s,2,2,w-4,h-4,1,'#1c1f24');for(let i=0;i<4;i++)box(s,3+i*4,3,3,h-6,.5,'#2a2e36');}   // the empty coin tray
        else{s.fill(rect(2,2,w-6,1.2),'rgba(255,255,255,0.18)');s.fill([ellipse(w*.3,h*.6,3,1.6,.3)],'rgba(20,16,10,0.4)');
            box(s,w/2-3,h/2-1.5,6,3,.8,'#c9ccd2','#3a3e46',.5);bills(s,w-4,h-2,1);}
    });}},
    shop_bag:{draw(art,piece,look){art.still(s=>{                       // a store bag: rose paper, black rope handles, tissue
        const {width:w,height:h}=piece;
        pool(s,w,h);
        for(const hx of [5,w-5])s.stroke([['move',hx-2,2],['quadratic',hx,-5,hx+2,2]],'#1a1014',1.1);
        box(s,0,1,w,h-1,1.5,look.paper,'#7a3a4e',.8);
        s.text(look.initials,w/2,h/2+2,{font:{family:'serif',size:6,weight:600},align:'center',baseline:'middle'},{fill:STASH_GOLD});
        if(searched(piece)){s.enter({position:[w+2,h-3],rotation:.4});box(s,-6,-3,12,6,2,'#f6eef2','rgba(120,80,100,0.5)',.5);s.leave();}   // the tissue, pulled out
        else s.fill([['move',3,2],['line',7,-3],['line',10,1],['line',14,-3],['line',w-3,2]],'#f6eef2');
    });}},
    receipt_envelope:{draw(art,piece,look){art.still(s=>{               // a cream envelope, the store's seal
        const {width:w,height:h}=piece,fold=[['move',0,0],['line',w/2,h*.55],['line',w,0]];
        pool(s,w,h);box(s,0,0,w,h,1,'#f2e6cf','#9a8458',.6);
        s.stroke(fold,'rgba(120,96,56,0.6)',.5);
        if(searched(piece))s.paint([['move',0,0],['line',w/2,-h*.6],['line',w,0]],{fill:'#e6d6b8',stroke:'rgba(120,96,56,0.6)',stroke_width:.5});
        else{disc(s,w/2,h*.55,2.2,look.seal,STASH_GOLD_DARK,.4);bills(s,w-6,1,1);}
    });}},
    offering_bowl:{draw(art,piece,look){art.still(s=>{                  // a black stone bowl of coins and wax, three bone candles round it
        const {width:w,height:h}=piece;
        pool(s,w,h);
        for(const [cx,cy] of [[-3,2],[w+3,2],[w/2,h+3]]){disc(s,cx,cy,2,'#e8dcc6');disc(s,cx,cy-.5,.8,'#ffb46a');}
        s.outlined([ellipse(w/2,h/2,w/2,h/2)],'#16101a','#4a2a4a',1);
        s.fill([ellipse(w/2,h/2,w/2-3,h/2-2.5)],'#2a1626');
        if(!searched(piece))for(let i=0;i<7;i++)disc(s,w/2+Math.cos(i*2.4)*(i%3+1)*2.4,h/2+Math.sin(i*2.4)*(i%3)*1.4,1.7,i%2?STASH_GOLD:'#c9a24a',STASH_GOLD_DARK,.3);
        else disc(s,w/2,h/2,2.2,'rgba(176,112,255,0.5)');                                          // a last violet ember in the empty bowl
    });}},
    tribute_chest:{draw(art,piece,look){art.still(s=>{                  // a black-lacquer chest bound in gold, a crimson gem in the lock
        const {width:w,height:h}=piece;
        pool(s,w,h);box(s,0,0,w,h,2,look.lacquer,STASH_GOLD,1);
        s.fill([...rect(6,0,2,h),...rect(w-8,0,2,h)],STASH_GOLD_DARK);                                // the bands
        if(searched(piece)){box(s,-1,-h*.6,w+2,h*.6,2,'#2a0e18',STASH_GOLD,.8);box(s,3,3,w-6,h-6,1.5,'#3a0614');disc(s,w/2,h/2,1.4,'rgba(255,90,110,0.6)');}
        else{s.fill(rect(2,2,w-4,1.2),'rgba(255,220,150,0.25)');
            for(let i=0;i<5;i++)disc(s,4+i*(w-8)/4,-1,1.6,STASH_GOLD,STASH_GOLD_DARK,.3);                 // coins spilling over the lip
            disc(s,w/2,h/2,2.6,look.gem,STASH_GOLD,.6);disc(s,w/2-.7,h/2-.7,.8,'rgba(255,220,230,0.8)');}
    });}}
};
