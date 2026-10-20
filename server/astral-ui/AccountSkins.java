package astral.atmosphere;

import com.google.gson.JsonParser;
import com.mojang.authlib.minecraft.MinecraftProfileTexture;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import java.lang.reflect.Field;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/** Public appearance only. No account credentials are passed to the game. */
@Mod.EventBusSubscriber(modid="astralatmosphere",value=Dist.CLIENT)
public final class AccountSkins {
 private static final String ENDPOINT="https://firestore.googleapis.com/v1/projects/astral-524a1/databases/(default)/documents/accountSkins/";
 private static final ExecutorService WORKER=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"Astral skins");t.setDaemon(true);return t;});
 private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NEVER).build();
 private static final Map<String,Entry> CACHE=new LinkedHashMap<>();
 private static final ResourceLocation DEFAULT_SKIN=new ResourceLocation("astralatmosphere","textures/default-skin.png");
 private static Field textures,model;private static int ticks,epoch;private static boolean disabled;
 private static class Entry {ResourceLocation texture;String model="default",png="";long next;boolean pending;}
 @SubscribeEvent public static void tick(TickEvent.ClientTickEvent event){
  if(event.phase!=TickEvent.Phase.END||disabled||++ticks%20!=0)return;
  Minecraft mc=Minecraft.m_91087_();var connection=mc.m_91403_();
  if(connection==null){if(!CACHE.isEmpty()){epoch++;for(Entry e:CACHE.values())if(e.texture!=null)mc.m_91097_().m_118513_(e.texture);CACHE.clear();}return;}
  try{
   if(textures==null){textures=PlayerInfo.class.getDeclaredField("f_105299_");textures.setAccessible(true);model=PlayerInfo.class.getDeclaredField("f_105303_");model.setAccessible(true);}
   Set<String> visible=new HashSet<>();for(PlayerInfo p:connection.m_105142_())visible.add(p.m_105312_().getName().toLowerCase(Locale.ROOT));
   var iterator=CACHE.entrySet().iterator();while(iterator.hasNext()){var row=iterator.next();if(!visible.contains(row.getKey())){if(row.getValue().texture!=null)mc.m_91097_().m_118513_(row.getValue().texture);iterator.remove();}}
   for(PlayerInfo player:connection.m_105142_()){
    String name=player.m_105312_().getName().toLowerCase(Locale.ROOT);if(!name.matches("[a-z0-9_]{3,16}"))continue;
    Entry entry=CACHE.get(name);if(entry==null){if(CACHE.size()>=64)continue;entry=new Entry();CACHE.put(name,entry);}
    player.m_105337_();skinMap(player).put(MinecraftProfileTexture.Type.SKIN,entry.texture!=null?entry.texture:DEFAULT_SKIN);model.set(player,entry.model);
    if(!entry.pending&&System.currentTimeMillis()>=entry.next){entry.pending=true;entry.next=System.currentTimeMillis()+120000;Entry target=entry;int generation=epoch;WORKER.submit(()->fetch(name,target,generation));}
   }
  }catch(ReflectiveOperationException|RuntimeException ex){disabled=true;System.err.println("[Astral] Skins unavailable: "+ex.getClass().getSimpleName());}
 }
 @SuppressWarnings("unchecked") private static Map<MinecraftProfileTexture.Type,ResourceLocation> skinMap(PlayerInfo p)throws IllegalAccessException{return (Map<MinecraftProfileTexture.Type,ResourceLocation>)textures.get(p);}
 private static void fetch(String name,Entry entry,int generation){
  String png=null,shape="default";boolean removed=false;
  try{
   var response=HTTP.send(HttpRequest.newBuilder(URI.create(ENDPOINT+name)).timeout(Duration.ofSeconds(12)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
   try(var stream=response.body()){
    removed=response.statusCode()==404;
    if(response.statusCode()==200){byte[] bytes=stream.readNBytes(120001);if(bytes.length>120000)throw new IllegalArgumentException();var fields=JsonParser.parseString(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonObject("fields");png=fields.getAsJsonObject("png").get("stringValue").getAsString();shape=fields.getAsJsonObject("model").get("stringValue").getAsString().equals("slim")?"slim":"default";}
   }
  }catch(Exception ignored){/* Keep the last appearance on a transient connection failure. */}
  final String data=png,kind=shape;final boolean reset=removed;
  Minecraft.m_91087_().execute(()->{
   if(generation!=epoch||CACHE.get(name)!=entry)return;entry.pending=false;
   if(reset){if(entry.texture!=null)Minecraft.m_91087_().m_91097_().m_118513_(entry.texture);entry.texture=null;entry.png="";entry.model="default";return;}
   if(data==null||data.equals(entry.png)){if(data!=null)entry.model=kind;return;}
   try{
    if(!data.startsWith("data:image/png;base64,")||data.length()>100000)return;
    byte[] decoded=Base64.getDecoder().decode(data.substring(22));
    if(decoded.length<24||java.nio.ByteBuffer.wrap(decoded).getLong()!=0x89504e470d0a1a0aL||java.nio.ByteBuffer.wrap(decoded,16,8).getInt()!=64||java.nio.ByteBuffer.wrap(decoded,20,4).getInt()!=64)return;
    NativeImage image=NativeImage.m_271751_(decoded);if(image.m_84982_()!=64||image.m_85084_()!=64){image.close();return;}
    Minecraft mc=Minecraft.m_91087_();ResourceLocation old=entry.texture;
    entry.texture=mc.m_91097_().m_118490_("astral_skin_"+name,new DynamicTexture(image));entry.png=data;entry.model=kind;
    if(old!=null)mc.m_91097_().m_118513_(old);
   }catch(Exception ignored){System.err.println("[Astral] Ignored invalid skin image");}
  });
 }
}
