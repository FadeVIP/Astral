package astral.cosmeticsqa;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import com.google.gson.JsonParser;
@Mod("astralcosmeticsqa")
public class CosmeticsTest {
 @Mod.EventBusSubscriber(modid="astralcosmeticsqa",value=Dist.CLIENT)
 public static class Events {
  static int ticks;static boolean done;
  @SubscribeEvent public static void tick(TickEvent.ClientTickEvent event){
   if(done||event.phase!=TickEvent.Phase.END||++ticks<80)return;var mc=Minecraft.m_91087_();if(mc.f_91080_==null)return;System.out.println("COSMETICS_QA_SCREEN "+mc.f_91080_.getClass().getName());done=true;
   try{if(mc.f_91080_.getClass().getName().contains("LoadingError"))throw new AssertionError("Forge loading error screen");var cls=Class.forName("astral.atmosphere.AccountCosmetics");var count=cls.getDeclaredField("registeredLayers");count.setAccessible(true);if(count.getInt(null)<2)throw new AssertionError("Missing classic/slim rendering layers");var method=cls.getDeclaredMethod("build",com.google.gson.JsonObject.class);method.setAccessible(true);for(String kind:new String[]{"cape","wings","hat","halo","aura"})for(int design=0;design<4;design++){var json=JsonParser.parseString("{\"kind\":{\"stringValue\":\""+kind+"\"},\"color\":{\"stringValue\":\"#ba8dff\"},\"design\":{\"integerValue\":\""+design+"\"}}").getAsJsonObject();if(method.invoke(null,json)==null)throw new AssertionError("Missing model");}
    try(var input=cls.getResourceAsStream("/assets/astralatmosphere/textures/default-skin.png")){var image=com.mojang.blaze3d.platform.NativeImage.m_85058_(input);if(image.m_84982_()!=64||image.m_85084_()!=64)throw new AssertionError("Default skin dimensions");image.close();}
    System.out.println("ASTRAL_COSMETICS_RUNTIME_PASS: both player layers, 20 models, default skin, launcher startup");
   }catch(Throwable e){System.err.println("ASTRAL_COSMETICS_RUNTIME_FAIL "+e);e.printStackTrace();}finally{mc.m_91395_();}
  }
 }
}
