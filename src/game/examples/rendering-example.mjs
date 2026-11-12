import definition from '../data/game-assets/rendering-example.json' with { type: 'json' };

/** Directory-owned visual fixture shared by the example and pixel acceptance test. */
export async function installRenderingExample(engine){
    engine.api.assets.registerLibrary(definition);const data=engine.api.assets.getResource('df_rendering_example:board').data,installed=[];
    try{
        for(const [id,resource]of Object.entries(data.resources)){await engine.api.render.registerResource(id,resource);installed.push(id);}
        engine.removeSystem('appearance');
        engine.registerSystem('rendering-board',{
            attach(context){for(const id of installed)context.defer(()=>context.api.render.releaseResource(id));},
            render(context,blend,frame){
                frame.clear('#101010');for(const packet of data.base)frame.submit(packet);
                frame.beginPass({target_id:'board:layer',viewport:{width:32,height:32}});
                for(const packet of data.offscreen)frame.submit(packet);frame.endPass();
                for(const packet of data.composite)frame.submit(packet);
            }
        });
    }catch(error){for(const id of installed.reverse())engine.api.render.releaseResource(id);throw error;}
}
