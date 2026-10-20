// Neural Systems: a luxury department store carved from dark sapphire crystal.
const NEURAL = { ink:'#081326', navy:'#102444', blue:'#234d80', cobalt:'#326fc2', ice:'#bed8ee',
    metal:'#9baebe', pale:'#e5e6df', gold:'#c1a980', glass:'#102a46' };
const NeuralArt = {
    box(c,x,y,w,h,fill,stroke,r=3,lw=1){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}},
    text(c,t,x,y,size,color=NEURAL.ice){c.fillStyle=color;c.font=`${size}px Georgia,serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(t,x,y);},
    crystal(c,x,y,w,h,base='#102d59'){
        const pts=[[x+w*.18,y],[x+w*.82,y],[x+w,y+h*.24],[x+w*.82,y+h],[x+w*.18,y+h],[x,y+h*.24]],cx=x+w*.5,cy=y+h*.48;
        const colors=[base,'#28588a','#15345b','#0b1b3c','#1b4374','#456d9b'];
        for(let i=0;i<6;i++){const a=pts[i],b=pts[(i+1)%6];c.fillStyle=colors[i];c.beginPath();c.moveTo(...a);c.lineTo(...b);c.lineTo(cx,cy);c.closePath();c.fill();}
        c.strokeStyle='rgba(181,216,243,.6)';c.lineWidth=.8;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.stroke();
        c.strokeStyle='rgba(232,245,255,.3)';c.beginPath();c.moveTo(x+w*.18,y+1);c.lineTo(cx,cy);c.lineTo(x+w*.82,y+h-1);c.stroke();
    },
    seal(c,x,y,r,color=NEURAL.ice){
        c.save();c.translate(x,y);c.strokeStyle=color;c.lineWidth=Math.max(.7,r*.022);
        c.beginPath();c.moveTo(0,-r);c.lineTo(r*.7,-r*.35);c.lineTo(r*.52,r*.55);c.lineTo(0,r);c.lineTo(-r*.52,r*.55);c.lineTo(-r*.7,-r*.35);c.closePath();c.stroke();
        c.beginPath();c.moveTo(0,-r);c.lineTo(r*.3,0);c.lineTo(0,r);c.lineTo(-r*.3,0);c.closePath();c.moveTo(-r*.7,-r*.35);c.lineTo(r*.7,-r*.35);c.moveTo(-r*.52,r*.55);c.lineTo(r*.52,r*.55);c.stroke();c.restore();
    }

};
class NeuralSystemsBuilding extends BuildingV2 {
    _setupSign(){this.attachedSign=null;}
    _generateLights(){
        const e=this._entrance();if(e)for(const d of [-76,76])this.attachedLights.push(new LampEntity({
            x:e.cx+e.ny*d+e.nx*14,y:e.cy-e.nx*d+e.ny*14,lampType:3,color:'#b4d1f5',lightRadius:145}));
        this.topReach=80;this.glowReach=80;
    }
    _neuralLayer(c,key,paint,k=1){
        const ready=!document.fonts||document.fonts.check('16px Georgia');
        if(!ready){c.save();LandmarkKit.plane(c,k);paint(c);c.restore();return;}
        const s=LandmarkKit.sprite(this,key,this.x-36,this.y-36,472,472,1,paint);LandmarkKit.drawSprite(c,s,k);
    }
    _neuralForecourt(){
        const e=this._entrance();if(!e)return null;
        return e.ny?{x:e.cx-110,y:e.cy+(e.ny<0?-42:0),w:220,h:42}
            :{x:e.cx+(e.nx<0?-42:0),y:e.cy-110,w:42,h:220};
    }
    drawBase(c){
        super.drawBase(c);
        this._neuralLayer(c,'neural_entry',p=>{
            const e=this._entrance();if(!e)return;
            p.save();p.transform(e.ny,-e.nx,e.nx,e.ny,e.cx,e.cy);
            NeuralArt.box(p,-82,0,164,34,'#172840',NEURAL.metal,3);
            for(const y of [8,17,26]){p.strokeStyle='#526275';p.lineWidth=.6;p.beginPath();p.moveTo(-80,y);p.lineTo(80,y);p.stroke();}
            NeuralArt.box(p,-41,0,82,33,'rgba(111,161,205,.24)','#afc8dc',1);
            p.strokeStyle='#b0c7d8';p.lineWidth=.8;p.beginPath();p.moveTo(0,1);p.lineTo(0,31);p.stroke();
            NeuralArt.seal(p,0,16,9,NEURAL.pale);
            for(const x of [-101,85]){
                NeuralArt.crystal(p,x,3,16,28,'#41648c');
            }p.restore();
        });
    }
    drawTop(c){
        const cam=game.camera,k=CONFIG.BUILDINGS.LEAN?1+this._leanScale():1;
        const P=(x,y)=>[cam.x+(x-cam.x)*k,cam.y+(y-cam.y)*k];
        c.save();
        for(const f of this._visibleFaces(cam)){
            const a=P(f.x1,f.y1),b=P(f.x2,f.y2),g=c.createLinearGradient(f.x1,f.y1,a[0],a[1]);
            g.addColorStop(0,'#081326');g.addColorStop(.5,'#163552');g.addColorStop(1,'#30567a');
            c.fillStyle=g;c.beginPath();c.moveTo(f.x1,f.y1);c.lineTo(f.x2,f.y2);c.lineTo(...b);c.lineTo(...a);c.closePath();c.fill();
            c.strokeStyle='#8cabbf';c.lineWidth=1;c.stroke();
            const count=Math.max(2,Math.floor(Math.hypot(f.x2-f.x1,f.y2-f.y1)/72));
            c.beginPath();c.strokeStyle='rgba(165,204,239,.32)';c.lineWidth=.8;
            for(let i=1;i<count;i++){const u=i/count,x=f.x1+(f.x2-f.x1)*u,y=f.y1+(f.y2-f.y1)*u,q=P(x,y);c.moveTo(x,y);c.lineTo(...q);c.lineTo(...b);}c.stroke();
            for(const u of [.16,.92]){c.strokeStyle=u===.16?'#c0b49c':'#35577c';c.lineWidth=u===.16?2:1;c.beginPath();c.moveTo(f.x1+(a[0]-f.x1)*u,f.y1+(a[1]-f.y1)*u);c.lineTo(f.x2+(b[0]-f.x2)*u,f.y2+(b[1]-f.y2)*u);c.stroke();}
        }c.restore();
        this._neuralLayer(c,'neural_roof',p=>{
            const x=this.x,y=this.y,B=NeuralArt.box,T=NEURAL;
            for(const s of this.sections){
                const g=p.createLinearGradient(x+s.x,y+s.y,x+s.x+s.w,y+s.y+s.h);g.addColorStop(0,'#264363');g.addColorStop(.45,'#11233c');g.addColorStop(1,'#0a1427');
                B(p,x+s.x,y+s.y,s.w,s.h,g,T.metal,4,1.5);B(p,x+s.x+7,y+s.y+7,s.w-14,s.h-14,null,'#43638a',3);
            }
            // Large, quiet facets read as load-bearing crystal rather than cladding.
            NeuralArt.crystal(p,x+13,y+12,374,175,'#183d6d');
            NeuralArt.crystal(p,x+123,y+34,154,122,'#315d8b');
            p.save();p.globalAlpha=.24;p.fillStyle='#c0daf0';p.beginPath();p.moveTo(x+49,y+16);p.lineTo(x+75,y+16);p.lineTo(x+289,y+180);p.lineTo(x+252,y+180);p.closePath();p.fill();p.restore();
            NeuralArt.crystal(p,x+87,y+210,226,178,'#183963');
            // Engraved department-store lettering sits directly on the sapphire surface.
            NeuralArt.text(p,'NEURAL',x+200,y+278,29,T.pale);
            NeuralArt.text(p,'S Y S T E M S',x+200,y+307,12,T.ice);
            p.fillStyle='#b4c7d7';p.fillRect(x+158,y+326,84,.7);
            NeuralArt.text(p,'THE ART OF BECOMING',x+200,y+348,7,T.pale);

        },k);
    }
    drawEmissive(c,dark=1,beamsOnly=false){
        if(beamsOnly||dark<.04)return;const k=CONFIG.BUILDINGS.LEAN?1+this._leanScale():1;
        c.save();c.globalAlpha=dark*.65;c.globalCompositeOperation='lighter';
        this._neuralLayer(c,'neural_glow',p=>{
            NeuralArt.text(p,'NEURAL',this.x+200,this.y+278,29,'#a7cdf4');
            NeuralArt.text(p,'S Y S T E M S',this.x+200,this.y+307,12,'#82aed8');
            NeuralArt.seal(p,this.x+200,this.y+96,30,'#668db8');
            for(const s of this.sections){p.strokeStyle='#2b548a';p.lineWidth=2;p.strokeRect(this.x+s.x+8,this.y+s.y+8,s.w-16,s.h-16);}},k);c.restore();
    }
    drawSign(){}
}
