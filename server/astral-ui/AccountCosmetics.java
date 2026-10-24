package astral.atmosphere;

import com.google.gson.*;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.*;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.core.Direction;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.EntityRenderersEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Public cosmetics, rendered locally. Does not change inventory or gameplay. */
@Mod.EventBusSubscriber(modid="astralatmosphere",value=Dist.CLIENT)
public final class AccountCosmetics {
 private static final String BASE="https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime/publicGameData/outfits/";
 private static final String[] KINDS={"cape","wings","hat","halo","aura"};
 private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
 private static final ExecutorService WORKER=Executors.newFixedThreadPool(2,r->{Thread t=new Thread(r,"Astral cosmetics");t.setDaemon(true);return t;});
 private static final Map<String,Entry> CACHE=new HashMap<>();
 private static JsonObject templates;
 private static JsonObject publicItems;private static long publicItemsNext;
 private static synchronized JsonObject publicItem(String id)throws Exception{
  if(publicItems==null||System.currentTimeMillis()>publicItemsNext){
   var response=HTTP.send(HttpRequest.newBuilder(URI.create("https://829504-vds-korolevikh2001vlad.gmhost.pp.ua/api/v1/realtime/publicLauncherData/cosmetics.json")).timeout(Duration.ofSeconds(7)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
   try(var stream=response.body()){
    if(response.statusCode()!=200)throw new IllegalStateException();byte[] bytes=stream.readNBytes(2000001);if(bytes.length>2000000)throw new IllegalStateException();
    var data=JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8)).getAsJsonObject();if(!data.has("version")||data.get("version").getAsInt()!=1)throw new IllegalStateException();
    var result=new JsonObject();
    if(data.has("documents"))for(var row:data.getAsJsonArray("documents")){var doc=row.getAsJsonObject();String name=doc.get("name").getAsString();name=name.substring(name.lastIndexOf('/')+1);if(name.matches("[-a-z0-9]{1,64}"))result.add(name,doc.getAsJsonObject("fields"));}
    else if(!data.has("count")||data.get("count").getAsInt()!=0)throw new IllegalStateException();
    publicItems=result;publicItemsNext=System.currentTimeMillis()+60000;
   }
  }
  return publicItems.has(id)?publicItems.getAsJsonObject(id):new JsonObject();
 }
 private static int ticks,epoch;private static int registeredLayers;
 private static class Entry {List<Piece> pieces=List.of();long next;boolean pending;}
 private record Piece(String kind,List<Part> parts){}
 private record Part(ModelPart model,int color){}
 @SubscribeEvent public static void tick(TickEvent.ClientTickEvent event){
  if(event.phase!=TickEvent.Phase.END||++ticks%20!=0)return;
  var mc=Minecraft.m_91087_();var connection=mc.m_91403_();
  if(connection==null){if(!CACHE.isEmpty()){CACHE.clear();epoch++;}return;}
  Set<String> names=new HashSet<>();for(var info:connection.m_105142_())names.add(info.m_105312_().getName().toLowerCase(Locale.ROOT));
  CACHE.keySet().removeIf(x->!names.contains(x));
  for(String name:names){if(!name.matches("[a-z0-9_]{3,16}"))continue;Entry e=CACHE.get(name);if(e==null){if(CACHE.size()>=32)break;e=new Entry();CACHE.put(name,e);}if(!e.pending&&System.currentTimeMillis()>e.next){e.pending=true;e.next=System.currentTimeMillis()+60000;Entry target=e;int generation=epoch;WORKER.submit(()->fetch(name,target,generation));}}
 }
 private static JsonObject request(String route)throws Exception{
   var response=HTTP.send(HttpRequest.newBuilder(URI.create(BASE+route+".json")).timeout(Duration.ofSeconds(7)).GET().build(),HttpResponse.BodyHandlers.ofInputStream());
  try(var stream=response.body()){if(response.statusCode()==404)return new JsonObject();if(response.statusCode()!=200)throw new IllegalStateException();byte[] bytes=stream.readNBytes(32001);if(bytes.length>32000)throw new IllegalStateException();var json=JsonParser.parseString(new String(bytes,StandardCharsets.UTF_8));return json.isJsonNull()?new JsonObject():json.getAsJsonObject().getAsJsonObject("fields");}
 }
 private static String str(JsonObject fields,String key){return fields.has(key)?fields.getAsJsonObject(key).get("stringValue").getAsString():"";}
 private static void fetch(String name,Entry entry,int generation){
  List<JsonObject> items=new ArrayList<>();boolean ok=false;
  try{JsonObject equipped=request(name);for(String kind:KINDS){String id=str(equipped,kind);if(!id.matches("[-a-z0-9]{1,64}"))continue;JsonObject item=publicItem(id);if(kind.equals(str(item,"kind")))items.add(item);}ok=true;}catch(Exception ignored){}
  final boolean success=ok;
  Minecraft.m_91087_().execute(()->{if(epoch!=generation||CACHE.get(name)!=entry)return;entry.pending=false;if(!success)return;try{List<Piece> pieces=new ArrayList<>();for(JsonObject item:items)pieces.add(build(item));entry.pieces=List.copyOf(pieces);}catch(Exception ignored){System.err.println("[Astral] Ignored invalid cosmetic definition");}});
 }
 private static Piece build(JsonObject item)throws Exception{
  if(templates==null)try(var in=AccountCosmetics.class.getResourceAsStream("/cosmetic-models.json")){templates=JsonParser.parseString(new String(in.readAllBytes(),StandardCharsets.UTF_8)).getAsJsonObject();}
  String kind=str(item,"kind"),color=str(item,"color");int design=item.getAsJsonObject("design").get("integerValue").getAsInt();if(!color.matches("#[0-9a-fA-F]{6}")||design<0||design>3)throw new IllegalArgumentException();
  List<Part> parts=new ArrayList<>();for(JsonElement el:templates.getAsJsonArray(kind+"-"+design)){var b=el.getAsJsonObject();float x=b.get("x").getAsFloat(),y=b.get("y").getAsFloat(),z=b.get("z").getAsFloat(),w=b.get("w").getAsFloat(),h=b.get("h").getAsFloat(),t=b.get("t").getAsFloat();
   // Model coordinates: head origin at y=0; feet at y=24, down is positive.
   float origin=(kind.equals("hat")||kind.equals("halo"))?1.5f:1.5f;
   var cube=new ModelPart.Cube(0,0,(x-w/2)*16,(origin-y-h/2)*16,(z-t/2)*16,w*16,h*16,t*16,0,0,0,false,16,16,EnumSet.allOf(Direction.class));
   String tint=b.get("color").getAsString();parts.add(new Part(new ModelPart(List.of(cube),Map.of()),Integer.parseInt((tint.equals("#ba8dff")?color:tint).substring(1),16)));
  }return new Piece(kind,List.copyOf(parts));
 }
 @Mod.EventBusSubscriber(modid="astralatmosphere",bus=Mod.EventBusSubscriber.Bus.MOD,value=Dist.CLIENT)
 public static class Layers {
  @SubscribeEvent public static void add(EntityRenderersEvent.AddLayers event){
   try{var method=LivingEntityRenderer.class.getDeclaredMethod("m_115326_",RenderLayer.class);method.setAccessible(true);for(String skin:event.getSkins()){PlayerRenderer renderer=event.getSkin(skin);if(renderer!=null){method.invoke(renderer,new Layer(renderer));registeredLayers++;}}}
   catch(ReflectiveOperationException ex){System.err.println("[Astral] Cosmetic layer registration failed: "+ex.getClass().getSimpleName());}
  }
 }
 private static final class Layer extends RenderLayer<AbstractClientPlayer,PlayerModel<AbstractClientPlayer>> {
  private static final ResourceLocation WHITE=new ResourceLocation("astralatmosphere","textures/cosmetic-white.png");
  Layer(PlayerRenderer renderer){super(renderer);}
  @Override public void m_6494_(PoseStack pose,MultiBufferSource buffer,int light,AbstractClientPlayer player,float limb,float amount,float partial,float age,float yaw,float pitch){
   if(player.m_20145_()||player.m_5833_())return;
   Entry e=CACHE.get(player.m_36316_().getName().toLowerCase(Locale.ROOT));if(e==null)return;
   var vertices=buffer.m_6299_(RenderType.m_110452_(WHITE));
   for(Piece piece:e.pieces){pose.m_85836_();
    if(piece.kind.equals("hat")||piece.kind.equals("halo"))m_117386_().f_102808_.m_104299_(pose);else m_117386_().f_102810_.m_104299_(pose);
    if(piece.kind.equals("aura"))pose.m_252781_(new org.joml.Quaternionf().rotateY(age*.018f));
    if(piece.kind.equals("wings")||piece.kind.equals("cape"))pose.m_252781_(new org.joml.Quaternionf().rotateX((float)Math.sin(age*.07)*.025f));
    for(Part part:piece.parts){int c=part.color;part.model.m_104306_(pose,vertices,light,655360,((c>>16)&255)/255f,((c>>8)&255)/255f,(c&255)/255f,1);}
    pose.m_85849_();
   }
  }
 }
}
