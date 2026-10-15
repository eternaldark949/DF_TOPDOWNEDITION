// Vector contexts keep the images their nodes used; this drops the ones no visible node uses any more.
// (Buildings themselves are native GPU geometry: gl/buildings-system.js.)
Object.assign(NativeWebGLRenderer.prototype,{
    trimBuildingImages(ctx){
        const used=new Set([...(ctx.patternTextures||[]),...ctx.pool.filter(n=>n.visible&&n instanceof PIXI.Sprite).map(n=>n.texture.baseTexture)]);
        for(const [image,t]of ctx.images)if(!used.has(t.baseTexture)){ctx.images.delete(image);this.releaseImage(t);}
    },
});
