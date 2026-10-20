package astral.atmosphere;

import com.google.gson.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.*;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.*;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;

/** Local launcher bridge. Firebase credentials never enter Minecraft. */
@Mod.EventBusSubscriber(modid="astralatmosphere",value=Dist.CLIENT)
public final class FriendsMenu extends Screen {
 static final ExecutorService WORK=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"Astral friends");t.setDaemon(true);return t;});
 static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
 static final ScheduledExecutorService PROGRESS=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"Astral friends progress");t.setDaemon(true);return t;});
 static volatile boolean operating;static volatile long started,noticeUntil;static volatile int operation;
 static volatile JsonObject state=new JsonObject();static volatile boolean busy;static long next;static volatile String notice="Загрузка друзей…";
 final Screen parent;int page;boolean requests;
 FriendsMenu(Screen parent){super(Component.m_237113_("Друзья Astral"));this.parent=parent;}
 static JsonObject json(String key,String value){var o=new JsonObject();o.addProperty(key,value);return o;}
 static JsonArray rows(String key){return state.has(key)?state.getAsJsonArray(key):new JsonArray();}
 static String str(JsonObject o,String key){return o.has(key)?o.get(key).getAsString():"";}
 static boolean bool(JsonObject o,String key){return o.has(key)&&o.get(key).getAsBoolean();}
 static int online(){int n=0;for(var e:rows("friends"))if(bool(e.getAsJsonObject(),"online"))n++;return n;}
 static JsonObject call(String route,JsonObject body)throws Exception{
  Path file=Appearance.directory().resolve("friends-bridge.json");if(!Files.exists(file))throw new Exception("Запустите игру через обновлённый Astral Launcher.");
  if(Files.size(file)>2048)throw new Exception("Неверная настройка подключения.");var config=JsonParser.parseString(Files.readString(file)).getAsJsonObject();int port=config.get("port").getAsInt();String token=str(config,"token");
  if(port<1024||port>65535||!token.matches("[a-f0-9]{64}"))throw new Exception("Перезапустите игру через лаунчер.");
  var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+route)).timeout(Duration.ofSeconds(35)).header("Authorization","Bearer "+token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body.toString())).build();
  var response=HTTP.send(request,HttpResponse.BodyHandlers.ofInputStream());
  try(var stream=response.body()){byte[] bytes=stream.readNBytes(200001);if(bytes.length>200000)throw new Exception("Слишком большой ответ.");var result=JsonParser.parseString(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject();if(result.has("error"))throw new Exception(str(result,"error"));if(response.statusCode()!=200)throw new Exception("Лаунчер недоступен. Повторите попытку.");return result;}
 }
 static void refresh(){if(busy)return;busy=true;var mc=Minecraft.m_91087_();boolean world=mc.m_91092_()!=null;var players=new JsonArray();boolean inWorld=mc.f_91073_!=null&&mc.f_91074_!=null;if(inWorld&&mc.m_91403_()!=null)for(var player:mc.m_91403_().m_105142_())players.add(player.m_105312_().getName());WORK.submit(()->{try{var body=new JsonObject();body.addProperty("world",world);body.addProperty("inWorld",inWorld);body.add("players",players);state=call("/state",body);if(System.currentTimeMillis()>noticeUntil)notice=str(state,"status");}catch(Exception e){state=new JsonObject();notice=e.getMessage()==null?"Не удалось связаться с лаунчером.":e.getMessage();}finally{busy=false;Minecraft.m_91087_().execute(()->{if(Minecraft.m_91087_().f_91080_ instanceof FriendsMenu menu)menu.m_7856_();});}});}
 @SubscribeEvent public static void tick(TickEvent.ClientTickEvent e){if(e.phase!=TickEvent.Phase.END)return;if(System.currentTimeMillis()>next){next=System.currentTimeMillis()+(Minecraft.m_91087_().f_91080_ instanceof FriendsMenu?3000:10000);refresh();}}
 @SubscribeEvent public static void init(ScreenEvent.Init.Post e){
  if(!AstralAtmosphere.integrationOnly())return;
  Screen screen=e.getScreen();if(!(screen instanceof TitleScreen)&&!(screen instanceof PauseScreen))return;
  int width=Math.min(116,screen.f_96543_-8),x=screen.f_96543_-width-4,y=4;
  // Keep the pack's own menu; find a free row for our additional entry.
  for(;y+20<screen.f_96544_;y+=24){final int top=y;boolean occupied=screen.m_6702_().stream().anyMatch(c->c instanceof AbstractWidget w&&w.f_93624_&&w.m_252754_()<x+width&&w.m_252754_()+w.m_5711_()>x&&w.m_252907_()<top+20&&w.m_252907_()+w.m_93694_()>top);if(!occupied)break;}
  if(y+20>=screen.f_96544_)y=4;
  e.addListener(new AstralAtmosphere.MenuButton("Друзья · "+online(),x,y,width,20,false,()->Minecraft.m_91087_().m_91152_(new FriendsMenu(screen))){
   @Override public void m_88315_(GuiGraphics g,int mx,int my,float delta){m_93666_(Component.m_237113_("Друзья · "+online()));super.m_88315_(g,mx,my,delta);}
  });
 }
 void action(String route,JsonObject body){
  if(busy){notice="Обновляется список друзей. Подождите несколько секунд.";noticeUntil=System.currentTimeMillis()+5000;return;}busy=true;operating=true;started=System.currentTimeMillis();final int id=++operation;
  notice=switch(route){case "/host"->"Открываем мир для друзей…";case "/join"->"Проверяем разрешение на вход…";case "/stop"->"Закрываем доступ…";case "/approve"->"Сохраняем ответ на запрос…";default->"Отправляем запрос другу…";};m_7856_();
  final ScheduledFuture<?> poll=PROGRESS.scheduleWithFixedDelay(()->{
   if(!operating||operation!=id||!(route.equals("/host")||route.equals("/join")))return;
   try{var progress=call("/progress",new JsonObject());if(operating&&operation==id&&bool(progress,"busy")&&!str(progress,"message").isBlank())notice=str(progress,"message");}catch(Exception ignored){}
  },700,700,TimeUnit.MILLISECONDS);
  WORK.submit(()->{try{var result=call(route,body);operating=false;noticeUntil=System.currentTimeMillis()+10000;notice=result.has("message")?str(result,"message"):"Готово";
   if(route.equals("/host"))state.addProperty("hosting",true);if(route.equals("/stop"))state.addProperty("hosting",false);
   if(result.has("address")){String address=str(result,"address");Minecraft.m_91087_().execute(()->ConnectScreen.m_278792_(this,Minecraft.m_91087_(),ServerAddress.m_171864_(address),new ServerData("Мир друга Astral",address,false),false));}
  }catch(Exception e){operating=false;notice=e instanceof java.net.http.HttpTimeoutException?"Лаунчер не ответил вовремя. Проверяем состояние мира…":e.getMessage()==null?"Ошибка подключения. Попробуйте ещё раз.":e.getMessage();}
  finally{operating=false;poll.cancel(true);busy=false;next=0;Minecraft.m_91087_().execute(()->{if(Minecraft.m_91087_().f_91080_==this)m_7856_();});}});
 }
 AstralAtmosphere.MenuButton button(String label,int x,int y,int w,Runnable action){var button=new AstralAtmosphere.MenuButton(label,x,y,w,20,false,()->{if(!operating)action.run();});button.f_93623_=!operating;m_142416_(button);return button;}
 void host(){if(busy)return;var server=f_96541_.m_91092_();if(server==null){notice="Сначала откройте одиночный мир.";return;}try{if(!server.m_6992_()){int port;try(var socket=new ServerSocket(0)){port=socket.getLocalPort();}if(!server.m_7386_(null,false,port))throw new Exception("Не удалось открыть мир для сети.");}var data=new JsonObject();data.addProperty("port",server.m_7010_());action("/host",data);}catch(Exception e){notice=e.getMessage();}}
 @Override protected void m_7856_(){m_169413_();int left=Math.max(12,(f_96543_-440)/2),width=Math.min(440,f_96543_-24);
  button("Друзья · "+online(),left,38,width/2-3,()->{requests=false;page=0;m_7856_();});button("Запросы · "+rows("incoming").size(),left+width/2+3,38,width/2-3,()->{requests=true;page=0;m_7856_();});
  var list=rows(requests?"incoming":"friends");int count=Math.max(1,(f_96544_-158)/28);page=Math.min(page,Math.max(0,(list.size()-1)/count));
  for(int i=page*count;i<Math.min(list.size(),(page+1)*count);i++){var row=list.get(i).getAsJsonObject();int y=68+(i-page*count)*28;
   if(requests){String id=str(row,"id");button(str(row,"guest")+" — принять",left,y,width-78,()->{var data=json("id",id);data.addProperty("accept",true);action("/approve",data);});button("Отказать",left+width-74,y,74,()->{var data=json("id",id);data.addProperty("accept",false);action("/approve",data);});}
   else{String name=str(row,"nickname"),session=str(row,"session");JsonObject approval=null;for(var r:rows("outgoing"))if(str(r.getAsJsonObject(),"nickname").equals(name))approval=r.getAsJsonObject();final JsonObject entry=approval;
    String label=switch(session){case "together"->"Играет с вами";case "connecting"->"Входит в мир…";case "incoming"->"Просит войти";case "waiting_guest"->"Принят · ждём входа";case "approved"->"Принят · подключиться";case "pending"->"Ждём ответа";case "declined"->"Отказ · повторить";default->"Запросить вход";};
    button(name+(session.equals("together")?" • в вашем мире":bool(row,"playing")?" • играет":bool(row,"online")?" • в лаунчере":" • не в сети"),left,y,width-146,()->{});
    var control=button(label,left+width-142,y,142,()->{if(session.equals("incoming")){requests=true;page=0;m_7856_();return;}if(f_96541_.f_91073_!=null){notice="Выйдите из текущего мира перед подключением к другу.";noticeUntil=System.currentTimeMillis()+10000;return;}boolean join=session.equals("approved")&&entry!=null;action(join?"/join":"/request",json(join?"id":"nickname",join?str(entry,"id"):name));});
    if(session.equals("together")||session.equals("connecting")||session.equals("pending")||session.equals("waiting_guest"))control.f_93623_=false;
   }
  }
  int bottom=f_96544_-80;button("‹",left,bottom,24,()->{page=Math.max(0,page-1);m_7856_();});button("›",left+28,bottom,24,()->{page++;m_7856_();});button(operating?"Подождите…":bool(state,"hosting")?"Закрыть доступ":"Открыть мир друзьям",left+60,bottom,width-60,()->{if(bool(state,"hosting"))action("/stop",new JsonObject());else host();});button("Назад",left,f_96544_-28,width,()->f_96541_.m_91152_(parent));
 }
 @Override public boolean m_7043_(){return false;}
 @Override public void m_88315_(GuiGraphics g,int mx,int my,float delta){AstralAtmosphere.background(g,f_96543_,f_96544_,true);AstralAtmosphere.center(g,"ДРУЗЬЯ ASTRAL",f_96543_/2,15,AstralAtmosphere.WHITE);super.m_88315_(g,mx,my,delta);if(operating){int left=Math.max(12,(f_96543_-440)/2),width=Math.min(440,f_96543_-24),y=f_96544_-58;g.m_280509_(left,y,left+width,y+2,0xff302b45);int segment=Math.max(12,width/5),offset=(int)((System.currentTimeMillis()-started)/8%Math.max(1,width-segment));g.m_280509_(left+offset,y,left+offset+segment,y+2,AstralAtmosphere.ACCENT);AstralAtmosphere.center(g,"Выполняется · "+((System.currentTimeMillis()-started)/1000)+" с",f_96543_/2,27,AstralAtmosphere.MUTED);}String text=notice==null?"":notice;int limit=Math.max(20,(f_96543_-24)/6);for(int line=0;line<2&&line*limit<text.length();line++)AstralAtmosphere.text(g,text.substring(line*limit,Math.min(text.length(),(line+1)*limit)),12,f_96544_-54+line*10,AstralAtmosphere.MUTED);}
}

