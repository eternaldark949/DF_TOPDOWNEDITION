// The cafe's furniture families, drawn on the art toolkit. Each artist draws one piece from its
// top-left corner (0, 0) to (width, height), in the look its family declares in the prop catalog
// (game-assets/props.json). `piece.pick(k)` is a repeatable number for the piece (the same seed the
// classic art used, so every piece keeps the look it always had). Still parts go in `art.still`, and
// parts that move with `piece.time` go in `art.live`, in drawing order; still runs are painted once.
import {rect,circle,ellipse,polygon} from '../../../engine/basement/rendering/index.mjs';
import {box,disc,lines,choose,turned} from './draw.mjs';

// Tableware on the cafe's tables and counter: the same cups and candle jars everywhere.
const CUP={saucer:'#e8dcc4',rim:'rgba(120,90,60,0.6)',cup:'#f3e4c6',coffee:'#6b4423',gleam:'rgba(240,220,190,0.75)'};
const JAR={glass:'rgba(255,214,160,0.35)',rim:'rgba(255,230,190,0.6)',wax:'#f6ead6',wick:'#3a2410'};
function cup(s,cx,cy,col=CUP.cup,coffee=CUP.coffee){disc(s,cx,cy,4.6,CUP.saucer,CUP.rim,.6);disc(s,cx,cy,3.4,col);disc(s,cx,cy,2.6,coffee);disc(s,cx-.6,cy-.6,1,CUP.gleam);s.fill(rect(cx+4,cy-1,2.2,2),CUP.saucer);}
function candleJar(s,cx,cy){disc(s,cx,cy,4.2,JAR.glass,JAR.rim,.7);disc(s,cx,cy,2.2,JAR.wax);disc(s,cx,cy,.9,JAR.wick);}

export const CAFE_ARTISTS={
    bentwood_chair:{draw(art,piece,look){art.still(s=>turned(s,piece,(X,Y,W,H)=>{
        disc(s,X+W/2,Y+H/2+1,W/2-1,look.frame,look.frame_edge,1.2);
        disc(s,X+W/2,Y+H/2+1,W/2-5,choose(look.seats,piece.pick(2)));
        s.stroke([circle(X+W/2,Y+H/2+1,W/2-1,Math.PI*1.08,Math.PI*1.92)],look.back,3);
    }));}},
    upholstered_seat:{draw(art,piece,look){
        const p=piece.pick(1),i=look.upholstery.length-1-Math.min(look.upholstery.length-1,Math.floor(p*look.upholstery.length)),col=look.upholstery[i],dk=look.upholstery_dark[Math.min(i,look.upholstery_dark.length-1)];
        art.still(s=>turned(s,piece,(X,Y,W,H)=>{
            box(s,X,Y,W,H,10,dk);box(s,X,Y,W,H*.34,9,col,dk,1);
            box(s,X,Y+4,W*.18,H-6,6,col,dk,1);box(s,X+W*.82,Y+4,W*.18,H-6,6,col,dk,1);
            const sw=(W*.64)/look.seats;
            for(let k=0;k<look.seats;k++)box(s,X+W*.18+k*sw+1,Y+H*.32,sw-2,H*.62,6,col,'rgba(0,0,0,0.25)',.8);
            for(let k=1;k<4;k++)for(const yy of [Y+H*.12,Y+H*.24])s.fill([circle(X+W*k/4,yy,1.1)],'rgba(0,0,0,0.22)');   // tufting
            if(piece.pick(3)>1-look.throw){
                s.fill(polygon([[X+W*.62,Y+H*.3],[X+W*.84,Y+H*.3],[X+W*.8,Y+H*.95],[X+W*.56,Y+H*.9]]),look.throw_color);
                const rows=[];for(let k=.4;k<.95;k+=.1)rows.push([X+W*.6,Y+H*k,X+W*.82,Y+H*k]);lines(s,rows,'rgba(160,120,80,0.35)',.6);
            }
            if(look.cushioned)box(s,X+W*.24,Y+H*.3,W*.16,H*.2,4,look.cushion,'rgba(0,0,0,0.25)',.6);
        }));
    }},
    booth_bench:{draw(art,piece,look){art.still(s=>turned(s,piece,(X,Y,W,H)=>{
        box(s,X,Y,W,H,8,look.frame);box(s,X+2,Y+1,W-4,H*.38,7,look.upholstery,look.upholstery_dark,1);
        for(let i=0;i<look.seats;i++)box(s,X+3+i*(W-6)/look.seats,Y+H*.36,(W-6)/look.seats-2,H*.56,5,look.upholstery,'rgba(0,0,0,0.25)',.8);
        for(let i=1;i<6;i++)s.fill([circle(X+W*i/6,Y+H*.18,1.1)],'rgba(0,0,0,0.2)');
    }));}},
    cushion_bench:{draw(art,piece,look){art.still(s=>turned(s,piece,(X,Y,W,H)=>{
        box(s,X,Y,W,H,6,look.frame,look.frame_edge,1);
        const cols=look.cushions,n=Math.max(2,Math.round(W/62)),from=piece.seed[0]|0;
        for(let i=0;i<n;i++)box(s,X+3+i*(W-6)/n,Y+3,(W-6)/n-3,H-6,6,cols[(i+from)%cols.length],'rgba(0,0,0,0.22)',.8);
        for(let i=0;i<n;i+=2)box(s,X+8+i*(W-6)/n,Y+H-14,16,10,4,cols[(i+1+from)%cols.length],'rgba(0,0,0,0.25)',.6);   // pillows against the glass
    }));}},
    round_table:{draw(art,piece,look){art.still(s=>{
        const cx=piece.width/2,cy=piece.height/2,R=Math.min(piece.width,piece.height)/2;
        disc(s,cx,cy,R,look.top,look.edge,look.edge_width);disc(s,cx,cy,R-4,look.top_light);
        if(look.setting==='reading'){                                    // a stack of books, two mugs, a candle
            box(s,cx-16,cy-10,20,14,1,'#7a3b2e');box(s,cx-15,cy-13,18,4,1,'#d9c8a6');box(s,cx-14,cy-17,16,4,1,'#3e5a6e');
            cup(s,cx+10,cy-6);cup(s,cx+6,cy+10,'#e2c7a2');candleJar(s,cx-8,cy+10);return;
        }
        s.stroke([circle(cx,cy,R-10)],'rgba(255,220,170,0.08)',1);       // a candle jar, cups and saucers, a pastry, a sprig in a bud vase
        candleJar(s,cx,cy);
        const k=piece.pick(5);
        if(k>.3)cup(s,cx-13,cy+4);
        if(k>.55)cup(s,cx+13,cy-4,'#e2c7a2');
        if(k<.5){box(s,cx+6,cy+6,12,8,2,'#f1e4cc');disc(s,cx+12,cy+10,3,'#c27b4a');}
        disc(s,cx-6,cy-12,2.4,'rgba(220,235,255,0.5)');disc(s,cx-6,cy-14,2,piece.pick(6)>.5?'#e8b8c8':'#f4dcae');
    });}},
    cafe_table:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,r=Math.min(w,h)/2;
        box(s,0,0,w,h,look.round?r:4,look.top,look.edge,1.4);box(s,3,3,w-6,h-6,look.round?r-3:3,look.top_light);
        if(look.setting==='side'){cup(s,w/2-5,h/2);disc(s,w/2+8,h/2-3,2,'rgba(220,235,255,0.5)');return;}
        candleJar(s,w/2,h/2);
        cup(s,14,14);if(piece.pick(4)>.4)cup(s,w-14,h-14,'#e2c7a2');
        box(s,w-18,6,10,12,3,'rgba(220,235,255,0.25)','rgba(255,255,255,0.5)',.6);s.fill(rect(w-16,11,6,6),'#f4ead6');   // sugar
    });}},
    cafe_counter:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        if(piece.vertical){                                              // a side run: a cake under a glass dome, a jar of biscotti, cups
            box(s,0,0,w,h,4,look.wood,look.wood_dark,1.2);box(s,3,3,w-6,h-6,3,look.wood_light);
            for(let yy=10;yy<h-4;yy+=9)s.fill(rect(w-6,yy,4,5),'rgba(0,0,0,0.18)');   // the slats on the room side
            s.fill(rect(w-3,2,2,h-4),look.edge);
            disc(s,w/2,40,10,'rgba(230,240,255,0.18)','rgba(255,255,255,0.45)',.8);disc(s,w/2,40,7,'#d9a36a');disc(s,w/2-2,38,2,'#f4dcc0');
            box(s,w/2-5,74,10,14,3,'rgba(220,235,255,0.3)','rgba(255,255,255,0.5)',.7);s.fill(rect(w/2-3,78,6,8),'#c8935a');
            cup(s,w/2,112);cup(s,w/2,140,'#e9d2b4');return;
        }
        box(s,0,0,w,h,4,look.wood,look.wood_dark,1.2);box(s,3,3,w-6,h-9,3,look.wood_light);
        s.fill(rect(2,h-4,w-4,2),look.edge);                             // the edge the guests lean on
        const grain=[];for(let xx=12;xx<w;xx+=16)grain.push([xx,4,xx+6,h-8]);lines(s,grain,'rgba(255,220,170,0.08)',1);
        box(s,50,5,30,16,3,'#2a2026',look.brass,1);box(s,54,8,14,6,1,'rgba(170,255,200,0.65)');s.fill(rect(70,8,6,9),look.brass);   // the register
        disc(s,98,13,6,'rgba(220,235,255,0.25)','rgba(255,255,255,0.55)',.8);s.fill(rect(95,12,6,3),'#7fb06a');disc(s,99,15,1.4,look.brass);   // the tip jar
        cup(s,130,13);cup(s,150,15,'#d8b48c');
        const px=w-104,pw=98,pastry=look.pastries;                       // the pastry case: glass over two rows of something sweet
        box(s,px,2,pw,h-7,3,'rgba(255,236,210,0.12)','rgba(255,240,220,0.55)',1);
        for(let i=0;i<7;i++)for(let j=0;j<2;j++){
            const cx=px+9+i*13,cy=9+j*10,col=pastry[(i*3+j*5)%pastry.length];
            if((i+j)%3===2)s.fill([['move',cx-5,cy+3],['quadratic',cx,cy-6,cx+5,cy+3],['close']],col);   // croissants
            else{disc(s,cx,cy,4,col);disc(s,cx-1,cy-1,1.4,'rgba(255,255,255,0.4)');}
        }
        s.fill(rect(px+4,3,3,h-10),'rgba(255,255,255,0.22)');
    });}},
    espresso_machine:{draw(art,piece,look){
        const {width:w,height:h}=piece;
        art.still(s=>{
            box(s,0,0,w,h,6,look.body,'#2a2c32',1);box(s,3,3,w-6,h-10,5,look.face);box(s,3,3,w-6,5,3,look.trim);
            for(const gx of [18,w-18]){disc(s,gx,h-9,6,'#2a2c32',look.trim,1.2);disc(s,gx,h-9,2.5,'#111');}
            disc(s,w/2,18,5,'#f4efe6',look.trim,1);
        });
        art.live(s=>lines(s,[[w/2,18,w/2+3*Math.cos(piece.time),18+3*Math.sin(piece.time)]],'#a3241a',1));   // the gauge's needle
        art.still(s=>{for(let i=0;i<4;i++)disc(s,10+i*6,12,2.6,look.cups,'rgba(0,0,0,0.25)',.5);});   // cups warming on top
    }},
    coffee_grinder:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,3,8,w-6,h-8,3,look.body,look.body_edge,1);
        s.fill(polygon([[2,10],[w-2,10],[w-6,0],[6,0]]),look.hopper);
        for(let i=0;i<6;i++)disc(s,7+(i%3)*6,3+(i/3|0)*3,1.3,look.beans);
    });}},
    mug_shelf:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,mugs=look.mugs;
        box(s,0,h-8,w,8,2,look.shelf,look.shelf_edge,1);
        for(let i=0;i<look.count;i++){const mx=8+i*13.5,col=mugs[i%mugs.length];box(s,mx-5,2,10,11,2,col,'rgba(0,0,0,0.3)',.6);s.stroke([circle(mx+5,7,2.6,-1.2,1.2)],col,1.4);}
    });}},
    potted_plant:{loop:{period:2*Math.PI/.8,frames:10},pad:12,draw(art,piece,look){art.still(s=>{
        const cx=piece.width/2,cy=piece.height/2,big=look.fern,R=Math.min(piece.width,piece.height)/2;
        disc(s,cx,cy,R*.58,look.pot,look.pot_edge,1.2);disc(s,cx,cy,R*.44,look.soil);
        const n=big?13:9,sway=Math.sin(piece.time*.8+piece.seed[0])*.05;
        for(let i=0;i<n;i++){
            const a=i/n*Math.PI*2+sway+piece.pick(i)*.3,L=R*(big?1.25:.95)*(.75+piece.pick(i+9)*.35);
            s.fill([ellipse(cx+Math.cos(a)*L*.55,cy+Math.sin(a)*L*.55,L*.55,big?3.2:4.4,a)],i%2?look.leaf:look.leaf_light);
        }
    });}},
    fireplace:{pad:13,draw(art,piece,look){
        const {width:w,height:h}=piece;
        art.still(s=>{
            box(s,0,0,w,h,3,look.brick,look.brick_dark,1.5);
            const mortar=[];for(let yy=8,row=0;yy<h;yy+=8,row++){mortar.push([0,yy,w,yy]);for(let xx=row%2?6:12;xx<w;xx+=12)mortar.push([xx,yy-8,xx,yy]);}
            lines(s,mortar,look.mortar,1);
            box(s,w-4,-8,14,h+16,3,look.hearth,look.hearth_edge,1);             // the hearthstone
            box(s,8,26,w-14,h-52,4,look.firebox,look.firebox_edge,1.2);        // the firebox
            s.enter({position:[w/2+2,h/2],rotation:.4});s.fill(rect(-4,-26,8,52),look.logs);s.place({rotation:-.8});s.fill(rect(-4,-24,8,48),look.logs);s.leave();   // crossed logs
        });
        art.live(s=>{for(let i=0;i<7;i++){const f=.5+.5*Math.sin(piece.time*5+i*1.7);disc(s,w/2+2+(piece.pick(i)-.5)*12,34+i*((h-68)/6),2+f*1.5,`rgba(255,${90+80*f|0},30,${.55+.4*f})`);}});   // embers
        art.still(s=>{
            box(s,2,6,8,h-12,2,look.mantel);                                  // the mantel's shadow line
            for(const cy of [14,h-14]){disc(s,6,cy,3,look.brass);disc(s,6,cy,1.6,'#f6ead6');}   // candlesticks on the mantel
        });
    }},
    bookcase:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,x0=piece.seed[0],cols=look.spines;
        box(s,0,0,w,h,2,look.case,look.case_edge,1);
        let bx=x0+3;                                                     // spine by spine, from where the case stands
        while(bx<x0+w-4){
            const bw=3+(piece.pick(bx)*4|0),lean=piece.pick(bx+1)>.88,col=cols[(bx*7|0)%cols.length];
            if(lean){s.enter({position:[bx-x0,h-3],rotation:-.25});s.fill(rect(0,-(h-7),bw,h-7),col);s.leave();}else s.fill(rect(bx-x0,3,bw,h-6),col);
            bx+=bw+.6;
        }
        s.fill(rect(2,2,w-4,2),'rgba(255,220,160,0.08)');
    });}},
    record_player:{draw(art,piece,look){
        const {width:w,height:h}=piece,cx=3+(h-6)/2,cy=h/2;
        art.still(s=>{box(s,0,0,w,h,3,look.cabinet,look.cabinet_edge,1);box(s,3,3,h-6,h-6,2,look.deck);disc(s,cx,cy,(h-10)/2,look.vinyl);disc(s,cx,cy,3,look.label);});
        art.live(s=>s.stroke([circle(cx,cy,7,piece.time*3.5,piece.time*3.5+1.2)],'rgba(255,255,255,0.12)',.6));   // the record turning
        art.still(s=>{
            lines(s,[[h,4,cx+4,cy-2]],look.arm,1.2);
            for(let i=0;i<look.sleeves.length;i++)box(s,h+4+i*2,5,14,h-10,1,look.sleeves[i],'rgba(0,0,0,0.3)',.5);
        });
    }},
    chalkboard_easel:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,text={font:{family:'Georgia, serif',size:5,weight:600},align:'center',baseline:'middle'};
        box(s,0,0,w,h,2,look.frame,look.frame_edge,1);box(s,2,2,w-4,h-4,1,look.board);
        s.text(look.line_1,w/2,h/2-3,text,{fill:look.chalk});s.text(look.line_2,w/2,h/2+4,text,{fill:look.chalk});
    });}},
    range_stove:{draw(art,piece,look){art.still(s=>{
        // The soup pot stands on the lit burner, so its flame is hidden under it: the range is all still.
        const {width:w,height:h}=piece,by=h/2-2;
        box(s,0,0,w,h,3,look.body,look.body_edge,1);box(s,3,3,w-6,h-8,2,look.top);
        for(let i=0;i<4;i++)disc(s,18+i*32,by,10,look.burner,look.burner_ring,1);
        disc(s,50,by,11,look.pot,look.pot_edge,1);disc(s,50,by,8,look.soup);
        disc(s,114,by,10,look.pan,look.pan_edge,1);s.fill(rect(123,h/2-4,10,3),look.pan);
        for(let i=0;i<4;i++)disc(s,18+i*32,h-3,2,look.knobs);
    });}},
    double_sink:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.basin,look.basin_edge,1);box(s,6,5,w/2-9,h-10,4,look.bowl);box(s,w/2+3,5,w/2-9,h-10,4,look.bowl);disc(s,w/2,4,2.5,look.tap);
    });}},
    prep_table:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,3,look.block,look.block_edge,1.2);
        const grain=[];for(let xx=10;xx<w;xx+=10)grain.push([xx,2,xx,h-2]);lines(s,grain,look.grain,1);
        s.fill([ellipse(30,h/2,18,9)],look.loaf);
        const scores=[];for(let k=-10;k<=10;k+=6)scores.push([30+k-2,h/2-6,30+k+2,h/2+6]);lines(s,scores,look.loaf_score,1);
        box(s,64,10,30,22,3,look.board);s.fill(rect(70,20,18,2),look.knife);
        disc(s,122,h/2,12,look.bowl,look.bowl_edge,1);for(let i=0;i<4;i++)disc(s,118+(i%2)*8,h/2-3+(i>>1)*6,3.4,look.lemons);
    });}},
    fridge:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,4,look.body,look.body_edge,1);s.fill(rect(3,h*.42,w-6,1.5),look.seam);
        box(s,w-9,8,3,18,1,look.handle);box(s,w-9,h*.5,3,22,1,look.handle);
        box(s,8,10,14,10,1,look.notes[0]);box(s,26,30,12,12,1,look.notes[1%look.notes.length]);   // a note and a drawing on the door
    });}},
    jar_shelf:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece,v=piece.vertical,along=v?h:w,across=v?w:h,jars=look.jars;
        box(s,0,0,w,h,2,look.case,look.case_edge,1);
        for(let i=0;i*12+8<along;i++)for(let j=0;j<2;j++){const a=i*12+7,b=across*(j?.7:.3);disc(s,v?b:a,v?a:b,4,jars[(i*2+j)%jars.length],'rgba(0,0,0,0.3)',.6);}
    });}},
    stencilled_crate:{draw(art,piece,look){art.still(s=>{
        const {width:w,height:h}=piece;
        box(s,0,0,w,h,2,look.wood,look.wood_edge,1.2);
        lines(s,[[0,h/2,w,h/2],[0,0,w,h]],look.slats,1);
        s.text(look.label,w/2,h/2,{font:{family:'Georgia, serif',size:7,weight:700},align:'center',baseline:'middle'},{fill:look.stencil});
    });}},
    flour_sacks:{pad:9,draw(art,piece,look){art.still(s=>{
        for(let i=0;i<look.count;i++){
            const sx=4+i*24,sy=(i%2)*8;
            s.fill([ellipse(sx+16,sy+24,14,18)],'rgba(0,0,0,0.3)');
            s.outlined([ellipse(sx+13,sy+20,13,17)],look.sack,look.sack_edge,1);
            s.fill(rect(sx+6,sy+18,14,3),look.band);
        }
    });}}
};
