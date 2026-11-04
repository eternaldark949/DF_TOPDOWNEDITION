        // Hand-laid salvage yard: a continuous perimeter loop, two crosscuts and three combat spaces.
        // Coordinates are authored for the hub's 1805 x 650 block; collision and art share each footprint.
        const Scrapyard = {
            layout(block) {
                const sx=block.w/1800,sy=block.h/650;
                const rect=(x,y,w,h)=>({x:block.x+x*sx,y:block.y+y*sy,w:w*sx,h:h*sy});
                const cover=[];
                const add=(kind,x,y,w,h)=>cover.push({...rect(x,y,w,h),kind,variant:cover.length%4});
                add('wreck',140,170,165,64);add('wreck',380,290,150,65);
                add('wreck',150,410,185,68);add('wreck',420,470,140,60);
                add('scrap',420,130,100,90);add('scrap',300,310,70,65);
                add('container',720,155,110,64);add('crane',850,235,110,140);
                add('crusher',1010,160,120,95);add('scrap',1030,395,140,72);
                add('scrap',760,460,90,65);
                // An open-roof workshop: two side entrances and a broad southern loading door.
                add('wall',1300,135,370,22);add('wall',1300,157,22,78);
                add('wall',1300,370,22,95);add('wall',1670,135,22,150);
                add('wall',1300,465,80,22);add('wall',1500,465,192,22);
                add('bench',1390,190,160,50);add('bench',1480,365,160,50);
                add('container',1090,495,85,48);add('container',1570,495,130,48);
                // Staggered perimeter baffles keep the escape loop without a yard-length sniper lane.
                add('scrap',570,40,45,80);add('container',1130,70,45,85);
                add('container',660,530,55,85);add('scrap',1450,545,55,70);
                const spawns=[];
                // Marked gates feed both directions round the loop; none open into a firing dead end.
                for(const [u,v] of [[.06,.12],[.28,.12],[.69,.12],[.94,.12],[.06,.88],[.25,.88],[.74,.88],[.94,.88],[.035,.5],[.965,.5]]) {
                    for(const d of [-44,44])spawns.push({x:block.x+block.w*u+(u<.05||u>.95?0:d),y:block.y+block.h*v+(u<.05||u>.95?d:0)});
                }
                return {x:block.x,y:block.y,w:block.w,h:block.h,cover,spawns,
                    route:[[80,80],[540,80],[540,150],[650,150],[650,80],[1100,80],[1100,40],[1200,40],[1200,80],[1735,80],[1735,585],[1535,585],[1535,510],[1425,510],[1425,585],[735,585],[735,500],[640,500],[640,585],[80,585]].map(([x,y])=>({x:block.x+x*sx,y:block.y+y*sy})),
                    crosscuts:[{x:650,y0:150,y1:500},{x:1200,y0:80,y1:585}].map(p=>({from:{x:block.x+p.x*sx,y:block.y+p.y0*sy},to:{x:block.x+p.x*sx,y:block.y+p.y1*sy}}))};
            },
            populate(map,layout) {
                map.scrapyard=layout;
                for(const p of layout.cover)map.props.push(new PropEntity({x:p.x,y:p.y,width:p.w,height:p.h,
                    decorType:'sy_'+p.kind,variant:p.variant,color:'#72513c',mass:50000,fixedRotation:true}));
            },
            addLights(map) {
                const L=map.scrapyard;if(!L)return;
                for(const [x,y] of [[620,180],[620,450],[1215,200],[1215,450]]){
                    const l=new LampEntity({x:L.x+x*L.w/1800,y:L.y+y*L.h/650,lampType:1,color:'#eeb66b',lightRadius:250});
                    l._yardLight=true;map.lamps.push(l);
                }
            },
            drawProp(c,p) {
                const x=p.x,y=p.y,w=p.width,h=p.height,kind=p.decorType.slice(3),v=p.decor.variant;
                c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
                const box=(X,Y,W,H,color)=>{c.fillStyle=color;c.fillRect(X,Y,W,H);};
                box(x,y,w,h,'#18191b');box(x+2,y+2,w-4,h-4,'#473e35');
                box(x+3,y+3,w-6,3,'#a08c6b');box(x+3,y+h-8,w-6,6,'#222326');
                if(kind==='wreck'){
                    const colors=['#715044','#4e6770','#77714d','#683b3d'];
                    for(const yy of [y+2,y+h-12])for(const xx of [x+w*.15,x+w*.74])box(xx,yy,w*.13,10,'#101116');
                    box(x+8,y+9,w-16,h-22,colors[v]);box(x+w*.35,y+12,w*.33,h-28,'#272e35');
                    c.strokeStyle='#a5957d';c.lineWidth=1.5;c.beginPath();c.moveTo(x+15,y+12);c.lineTo(x+w*.29,y+h*.6);c.lineTo(x+w*.47,y+15);c.lineTo(x+w*.63,y+h-16);c.stroke();
                    box(x+w*.05,y+h*.4,w*.12,3,'#b2a797');box(x+w*.85,y+h*.35,w*.06,h*.25,'#b17c51');
                }else if(kind==='container'||kind==='wall'){
                    box(x+4,y+5,w-8,h-14,kind==='wall'?'#6f6652':v%2?'#7b4b39':'#4d6460');
                    c.strokeStyle='rgba(20,19,17,.55)';c.lineWidth=2;
                    for(let xx=x+11;xx<x+w-6;xx+=12){c.beginPath();c.moveTo(xx,y+5);c.lineTo(xx,y+h-10);c.stroke();}
                    if(kind==='container'){box(x+w*.72,y+5,3,h-14,'#b59d76');box(x+w*.82,y+h*.4,4,10,'#d1ba83');}
                }else if(kind==='scrap'){
                    const rnd=seededRandom(92+v);
                    for(let i=0;i<20;i++){
                        const xx=x+5+rnd()*(w-25),yy=y+5+rnd()*(h-25),r=6+rnd()*9;
                        c.fillStyle=['#85745d','#526467','#814c37','#a18b63'][i%4];c.beginPath();
                        c.moveTo(xx,yy+3);c.lineTo(xx+r*1.5,yy);c.lineTo(xx+r*1.8,yy+r);c.lineTo(xx+r*.4,yy+r*1.4);c.closePath();c.fill();
                        c.strokeStyle='#262a2b';c.lineWidth=1.5;c.stroke();
                        c.strokeStyle='rgba(203,180,135,.5)';c.beginPath();c.moveTo(xx+3,yy+6);c.lineTo(xx+r,yy+3);c.stroke();
                    }
                    for(let i=0;i<4;i++){const xx=x+12+rnd()*(w-25),yy=y+12+rnd()*(h-25);c.fillStyle='#171b1d';c.beginPath();c.arc(xx,yy,8,0,Math.PI*2);c.fill();c.strokeStyle='#605e52';c.lineWidth=2;c.beginPath();c.arc(xx,yy,4,0,Math.PI*2);c.stroke();}
                }else if(kind==='crane'){
                    box(x+9,y+8,w-18,h-21,'#b28b3c');box(x+18,y+16,w-36,h-40,'#383e40');box(x+14,y+h-42,27,21,'#78918c');box(x+14,y+h-22,27,6,'#574a35');
                    c.strokeStyle='#dbb95e';c.lineWidth=12;c.beginPath();c.moveTo(x+w*.5,y+h*.75);c.lineTo(x+w*.5,y+15);c.stroke();
                    c.strokeStyle='#282a2d';c.lineWidth=2;c.beginPath();c.moveTo(x+w*.65,y+12);c.lineTo(x+w*.65,y+h*.6);c.stroke();
                    c.beginPath();c.arc(x+w*.65,y+h*.63,7,0,Math.PI*1.5);c.stroke();
                }else if(kind==='crusher'){
                    box(x+7,y+7,w-14,h-20,'#9e7543');box(x+20,y+17,w-40,h-40,'#12171c');
                    for(let xx=x+23;xx<x+w-22;xx+=13){box(xx,y+18,6,14,'#aca58c');box(xx,y+h-35,6,13,'#817b69');}
                }else if(kind==='bench'){
                    box(x+5,y+5,w-10,h-16,'#94816a');
                    for(let xx=x+15;xx<x+w-15;xx+=27){box(xx,y+12,16,13,'#414c4e');box(xx+3,y+14,8,3,'#ccab67');}
                }
                // Rust freckles and a worn, consistent collision edge.
                c.strokeStyle='rgba(205,158,93,.3)';c.lineWidth=1;c.strokeRect(x+1,y+1,w-2,h-2);c.restore();
            },
            drawGround(ctx,L) {
                if(!L._ground){
                    const cv=document.createElement('canvas');cv.width=Math.ceil(L.w);cv.height=Math.ceil(L.h);
                    const c=cv.getContext('2d'),sx=L.w/1800,sy=L.h/650;c.scale(sx,sy);
                    c.fillStyle='#292723';c.fillRect(0,0,1800,650);
                    c.fillStyle='#393730';c.fillRect(90,110,480,440);c.fillStyle='#323639';c.fillRect(680,110,500,440);
                    c.fillStyle='#49473e';c.fillRect(1280,115,430,390);
                    const rnd=seededRandom(441);for(let i=0;i<220;i++){c.fillStyle=i%3?'rgba(188,151,92,.13)':'rgba(0,0,0,.22)';c.fillRect(rnd()*1800,rnd()*650,3+rnd()*24,2+rnd()*8);}
                    c.strokeStyle='rgba(207,174,95,.42)';c.lineWidth=3;c.setLineDash([16,14]);c.beginPath();L.route.forEach((p,i)=>c[i?'lineTo':'moveTo']((p.x-L.x)/sx,(p.y-L.y)/sy));c.closePath();c.stroke();
                    for(const p of L.crosscuts){c.beginPath();c.moveTo((p.from.x-L.x)/sx,(p.from.y-L.y)/sy);c.lineTo((p.to.x-L.x)/sx,(p.to.y-L.y)/sy);c.stroke();}c.setLineDash([]);
                    c.strokeStyle='rgba(15,17,19,.6)';c.lineWidth=5;for(const yy of [72,87,565,580]){c.beginPath();c.moveTo(95,yy);c.lineTo(1710,yy);c.stroke();}
                    c.font='bold 21px sans-serif';c.fillStyle='#b0a17e';c.textAlign='center';
                    for(const [x,text]of [[330,'01 / WRECK LANES'],[920,'02 / SORTING YARD'],[1500,'03 / WORKSHOP']])c.fillText(text,x,335);
                    c.font='bold 12px sans-serif';c.fillText('SALVAGE / KEEP ROUTES CLEAR',900,615);
                    for(const p of L.spawns.filter((_,i)=>i%2===0)){const x=(p.x-L.x)/sx,y=(p.y-L.y)/sy;
                        c.fillStyle='#ad7a3c';c.beginPath();c.moveTo(x-13,y);c.lineTo(x,y+(y<325?17:-17));c.lineTo(x+13,y);c.closePath();c.fill();}
                    L._ground=cv;
                }
                ctx.drawImage(L._ground,L.x,L.y,L.w,L.h);
            }
        };
