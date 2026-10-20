package astral.atmosphere;

import com.google.gson.*;
import java.net.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import net.minecraft.client.Minecraft;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/** Approximate opt-out online counter. Sends no nickname, world, progress or inventory. */
@Mod.EventBusSubscriber(modid="astralatmosphere",value=Dist.CLIENT)
public final class PackPresence {
    static final String KEY="AIzaSyCmI7epHT8ZnK-AlGzRPbLSy3b73bdt1-Y";
    static final String DB="https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app";
    static final Path AUTH=Path.of(".astral-presence-session.json"),SETTINGS=Path.of("config/astral-minepass/presence.json");
    static final ExecutorService WORKER=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"Astral online counter");t.setDaemon(true);return t;});
    static Future<?> pending;static long next,expires;static String token,uid;static boolean wasOnline;
    @SubscribeEvent public static void tick(TickEvent.ClientTickEvent e){
        if(e.phase!=TickEvent.Phase.END)return;
        if(net.minecraftforge.fml.ModList.get().isLoaded("astralminepassui"))return; // Existing MinePass owns the same installation heartbeat.
        boolean online=Minecraft.m_91087_().f_91074_!=null&&Minecraft.m_91087_().f_91073_!=null;
        long now=System.currentTimeMillis();if(pending!=null&&!pending.isDone())return;if(now<next&&online==wasOnline)return;
        if(!online&&!wasOnline)return;next=now+30000;wasOnline=online;
        pending=WORKER.submit(()->{try{boolean enabled=enabled();if(!enabled){if(token!=null)send(false);return;}authenticate();send(online);}catch(Exception ex){token=null;System.err.println("[MinePass] Online counter temporarily unavailable");}});
    }
    static boolean enabled()throws Exception{if(!Files.exists(SETTINGS)){Files.createDirectories(SETTINGS.getParent());Files.writeString(SETTINGS,"{\"enabled\":true,\"description\":\"Anonymous online counter; no nickname or world data is sent\"}");}return JsonParser.parseString(Files.readString(SETTINGS)).getAsJsonObject().get("enabled").getAsBoolean();}
    static void authenticate()throws Exception{
        if(token!=null&&System.currentTimeMillis()<expires)return;JsonObject auth;
        if(Files.exists(AUTH)){
            String refresh=JsonParser.parseString(Files.readString(AUTH)).getAsJsonObject().get("refreshToken").getAsString();
            auth=request("https://securetoken.googleapis.com/v1/token?key="+KEY,"POST","grant_type=refresh_token&refresh_token="+URLEncoder.encode(refresh,StandardCharsets.UTF_8),"application/x-www-form-urlencoded");
            token=auth.get("id_token").getAsString();uid=auth.get("user_id").getAsString();
        }else{
            auth=request("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="+KEY,"POST","{\"returnSecureToken\":true}","application/json");
            token=auth.get("idToken").getAsString();uid=auth.get("localId").getAsString();
            var saved=new JsonObject();saved.addProperty("refreshToken",auth.get("refreshToken").getAsString());Files.writeString(AUTH,saved.toString());
        }expires=System.currentTimeMillis()+3300000;
    }
    static void send(boolean online)throws Exception{
        request(DB+"/packPresence/"+uid+".json?auth="+URLEncoder.encode(token,StandardCharsets.UTF_8),online?"PUT":"DELETE",online?"{\"seen\":{\".sv\":\"timestamp\"},\"pack\":\"astral-1.20.1\"}":null,"application/json");
    }
    static JsonObject request(String url,String method,String body,String type)throws Exception{
        var c=(HttpURLConnection)URI.create(url).toURL().openConnection();c.setRequestMethod(method);c.setConnectTimeout(5000);c.setReadTimeout(6000);c.setInstanceFollowRedirects(false);
        try{if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type",type);try(var out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}}
            if(c.getResponseCode()/100!=2)throw new java.io.IOException("Presence HTTP "+c.getResponseCode());
            try(var in=c.getInputStream()){var json=JsonParser.parseString(new String(in.readNBytes(20000),StandardCharsets.UTF_8));return json.isJsonObject()?json.getAsJsonObject():new JsonObject();}
        }finally{c.disconnect();}
    }
}
