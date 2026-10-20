package astral.atmosphere;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Renderable;
import net.minecraft.client.gui.screens.*;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import java.util.*;

@Mod("astralatmosphere")
public final class AstralAtmosphere {
    static boolean integrationOnly(){return Boolean.getBoolean("astral.integrationOnly");}
    @Mod.EventBusSubscriber(modid="astralatmosphere",value=Dist.CLIENT)
    public static class Events {
        @SubscribeEvent(priority=EventPriority.LOWEST) public static void open(ScreenEvent.Opening e){
            if(integrationOnly())return;
            Screen screen=e.getNewScreen();
            if(screen instanceof TitleScreen&&!(screen instanceof Home))e.setNewScreen(new Home());
            else if(screen instanceof PauseScreen&&!(screen instanceof Pause))e.setNewScreen(new Pause());
        }
        @SubscribeEvent public static void frame(TickEvent.RenderTickEvent e){
            if(integrationOnly())return;
            if(e.phase!=TickEvent.Phase.START)return;
            Minecraft mc=Minecraft.m_91087_();
            if(mc.m_91265_() instanceof LoadingOverlay loading)mc.m_91150_(new Loading(loading));
        }
    }
    static final ResourceLocation BACKDROP=new ResourceLocation("astralatmosphere","textures/citadel.png");
    static final int WHITE=0xfff3edff,MUTED=0xffb4accb,ACCENT=0xffc4a3fa;
    static void text(GuiGraphics g,String text,int x,int y,int color){g.m_280056_(Minecraft.m_91087_().f_91062_,text,x,y,color,false);}
    static void center(GuiGraphics g,String text,int x,int y,int color){g.m_280137_(Minecraft.m_91087_().f_91062_,text,x,y,color);}
    static void brand(GuiGraphics g,int width,int y,float scale){g.m_280168_().m_85836_();g.m_280168_().m_252880_(width/2f,y,0);g.m_280168_().m_85841_(scale,scale,1);center(g,"A S T R A L",0,0,WHITE);g.m_280168_().m_85849_();}
    static void background(GuiGraphics g,int width,int height,boolean picture){
        g.m_280509_(0,0,width,height,0xff0b1020);
        if(picture){g.m_280168_().m_85836_();float scale=Math.max(width/1672f,height/941f);g.m_280168_().m_252880_((width-1672*scale)/2,(height-941*scale)/2,0);g.m_280168_().m_85841_(scale,scale,1);g.m_280163_(BACKDROP,0,0,0,0,1672,941,1672,941);g.m_280168_().m_85849_();}
        g.m_280509_(0,0,width,height,picture?0x990b1020:0x331f153b);
        // A deterministic star field: no random state or animation tied to frame rate.
        double time=System.nanoTime()/1e9;
        for(int i=0;i<72;i++){int x=Math.floorMod(i*7919+41,width),y=Math.floorMod(i*3571+71,height),alpha=(int)(55+60*(1+Math.sin(time*.4+i)));g.m_280509_(x,y,x+1,y+1,(alpha<<24)|0xc4cfee);}
        g.m_280509_(20,20,Math.min(68,width-20),21,ACCENT);
        g.m_280509_(Math.max(20,width-68),height-21,width-20,height-20,ACCENT);
    }
    static class StyledButton extends Button {
        final Button original;final boolean prominent;
        StyledButton(Button original,int x,int y,int w,int h,boolean prominent){super(x,y,w,h,original.m_6035_(),b->original.m_5691_(),f_252438_);this.original=original;this.prominent=prominent;f_93623_=original.f_93623_;f_93624_=original.f_93624_;m_257544_(original.m_278622_());}
        @Override protected void m_87963_(GuiGraphics g,int mx,int my,float partial){
            int x=m_252754_(),y=m_252907_(),w=m_5711_(),h=m_93694_();boolean hover=m_198029_();
            g.m_280509_(x,y,x+w,y+h,prominent?(hover?0xffd9c1ff:ACCENT):(hover?0xf03b3655:0xe01c2134));
            g.m_280509_(x,y,x+2,y+h,prominent?0xfff0e5ff:0xff79668f);
            String label=m_6035_().getString();if(label.isBlank())label=original.getClass().getSimpleName().contains("Language")?"Язык":"…";
            int color=!f_93623_?0xff7c7990:prominent?0xff19102b:WHITE;
            var font=Minecraft.m_91087_().f_91062_;g.m_280056_(font,label,x+(w-font.m_92895_(label))/2,y+(h-8)/2,color,false);
        }
    }
    static List<Button> buttons(Screen s){return s.m_6702_().stream().filter(x->x instanceof Button).map(x->(Button)x).toList();}
    static int buttonWidth(int width){return Math.min(160,(width-50)/2);}
    static class BaseTitle extends TitleScreen {BaseTitle(){super(false);}}
    static class BasePause extends PauseScreen {BasePause(){super(true);}}
    static class MenuButton extends Button {
        final boolean primary;
        MenuButton(String title,int x,int y,int w,int h,boolean primary,Runnable action){super(x,y,w,h,Component.m_237113_(title),b->action.run(),f_252438_);this.primary=primary;}
        @Override protected void m_87963_(GuiGraphics g,int mx,int my,float partial){int x=m_252754_(),y=m_252907_(),w=m_5711_(),h=m_93694_();g.m_280509_(x,y,x+w,y+h,primary?(m_198029_()?0xffdecaff:ACCENT):(m_198029_()?0xff3b3655:0xe01c2134));g.m_280509_(x,y,x+2,y+h,primary?WHITE:ACCENT);String label=m_6035_().getString();var font=Minecraft.m_91087_().f_91062_;text(g,label,x+(w-font.m_92895_(label))/2,y+(h-8)/2,primary?0xff19102b:WHITE);}
    }
    static class LinkButton extends MenuButton {
        final boolean support;
        LinkButton(Home owner,String title,String url,int x,int y,int w,boolean support){super(title,x,y,w,26,false,()->owner.link(url));this.support=support;}
        @Override protected void m_87963_(GuiGraphics g,int mx,int my,float partial){
            int x=m_252754_(),y=m_252907_(),w=m_5711_(),h=m_93694_();
            int edge=support?0xffffb5d0:0xffa6d9ff;
            g.m_280509_(x,y,x+w,y+h,edge);
            g.m_280509_(x+1,y+1,x+w-1,y+h-1,support?(m_198029_()?0xff67344e:0xff452338):(m_198029_()?0xff294e6b:0xff1d354c));
            String label=m_6035_().getString();var font=Minecraft.m_91087_().f_91062_;
            text(g,label,x+(w-font.m_92895_(label))/2,y+(h-8)/2,0xffffffff);
        }
    }
    static class SocialButton extends MenuButton {
        final int icon;
        static final String[][] PIXELS={
            {"..#####..",".#..#..#.","#...#...#","#...#...#","#########","#...#...#","#...#...#",".#..#..#.","..#####.."},
            {".##...##.","#########","#########","##.###.##","##.###.##","#########",".#######.","..#...#..","........."},
            {"........#","......###","...######","########.","..#####..","...###...","...##....","...#.....","........."},
            {".##...##.","####.####","#########","#########",".#######.","..#####..","...###...","....#....","........."}
        };
        SocialButton(Home owner,int icon,String title,String url,int x,int y){super(title,x,y,28,26,false,()->owner.link(url));this.icon=icon;m_257544_(net.minecraft.client.gui.components.Tooltip.m_257550_(Component.m_237113_(title)));}
        @Override protected void m_87963_(GuiGraphics g,int mx,int my,float partial){int x=m_252754_(),y=m_252907_();g.m_280509_(x,y,x+28,y+26,m_198029_()?0xff4a3c69:0xd0182033);int color=icon==3?0xffff9ebc:WHITE;for(int row=0;row<9;row++)for(int col=0;col<9;col++)if(PIXELS[icon][row].charAt(col)=='#')g.m_280509_(x+5+col*2,y+4+row*2,x+7+col*2,y+6+row*2,color);}
    }
    public static class Home extends Screen {
        final Appearance.Layout layout=Appearance.load();
        { if(layout.buttons.stream().noneMatch(b->b.action.equals("friends"))){var network=layout.buttons.stream().filter(b->b.action.equals("network")&&b.visible&&b.width>=180).findFirst();if(network.isPresent()){var b=network.get();int width=b.width;b.width=(width-6)/2;var f=Appearance.JSON.fromJson(Appearance.JSON.toJson(b),Appearance.Row.class);f.id="astral-friends";f.action="friends";f.label="Друзья";f.x=b.x+b.width+6;f.width=width-b.width-6;layout.buttons=new ArrayList<>(layout.buttons);layout.buttons.add(f);}} }
        public Home(){super(Component.m_237113_("Astral"));}
        void link(String url){f_96541_.m_91152_(new ConfirmLinkScreen(confirmed->{if(confirmed)net.minecraft.Util.m_137581_().m_137646_(url);f_96541_.m_91152_(this);},url,true));}
        @Override protected void m_7856_(){
            for(var row:layout.buttons)if(row.visible)m_142416_(new Appearance.ConfigButton(row,f_96543_,f_96544_,()->{
                switch(row.action){
                    case "play" -> f_96541_.m_91152_(new net.minecraft.client.gui.screens.worldselection.SelectWorldScreen(this));
                    case "network" -> f_96541_.m_91152_(new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(this));
                    case "friends" -> f_96541_.m_91152_(new FriendsMenu(this));
                    case "settings" -> f_96541_.m_91152_(new OptionsScreen(this,f_96541_.f_91066_));
                    case "quit" -> f_96541_.m_91395_();
                    case "link" -> link(row.url);
                }
            }));
        }
        @Override public void m_88315_(GuiGraphics g,int mx,int my,float partial){
            Appearance.background(g,f_96543_,f_96544_,layout);
            float scale=Math.min(2.6f,f_96543_/(float)Math.max(1,f_96541_.f_91062_.m_92895_(layout.title)+20));
            g.m_280168_().m_85836_();g.m_280168_().m_252880_(f_96543_/2f,f_96544_*25/360f,0);g.m_280168_().m_85841_(scale,scale,1);center(g,layout.title,0,0,Appearance.color(layout.titleColor));g.m_280168_().m_85849_();
            center(g,layout.subtitle,f_96543_/2,Math.round(f_96544_*55/360f),Appearance.color(layout.textColor));
            super.m_88315_(g,mx,my,partial);center(g,layout.footer,f_96543_/2,f_96544_-16,Appearance.color(layout.textColor));
        }
    }
    public static class Pause extends Screen {
        final BasePause original=new BasePause();
        public Pause(){super(Component.m_237113_("Astral • Пауза"));}
        boolean styled;
        @Override protected void m_7856_(){original.m_6575_(f_96541_,f_96543_,f_96544_);styled=false;}
        @Override public void m_86600_(){original.m_86600_();}
        @Override public void m_7861_(){original.m_7861_();}
        void style(){List<Button> main=new ArrayList<>(),extras=new ArrayList<>();for(var b:buttons(original)){if(b.getClass().getSimpleName().equals("AnnouncementIconWidget"))continue;String name=b.m_6035_().getString();if(name.contains("Menu List")||name.equals("Ц")||name.contains("Realms"))continue;if(name.contains("Copyright"))b.m_93666_(Component.m_237113_("Об игре"));if(name.isBlank()||b.m_5711_()<45)extras.add(b);else main.add(b);}m_169413_();int rows=(main.size()+1)/2,w=buttonWidth(f_96543_),gap=f_96544_<300?5:8,h=Math.min(23,Math.max(16,(f_96544_-145)/Math.max(1,rows)-gap)),y=Math.max(72,(f_96544_-60-rows*(h+gap))/2+26);for(int i=0;i<main.size();i++)m_142416_(new StyledButton(main.get(i),f_96543_/2-w-gap/2+(i%2)*(w+gap),y+(i/2)*(h+gap),w,h,i==0));for(int i=0;i<extras.size();i++){var b=extras.get(i);b.m_93674_(20);b.setHeight(20);b.m_252865_(f_96543_/2-extras.size()*12+i*24);b.m_253211_(f_96544_-44);m_142416_(b);}if(!m_6702_().isEmpty())m_7522_(m_6702_().get(0));m_142416_(new MenuButton("Друзья · "+FriendsMenu.online(),Math.max(5,f_96543_-120),4,115,20,false,()->f_96541_.m_91152_(new FriendsMenu(this))));styled=true;}
        @Override public void m_88315_(GuiGraphics g,int mx,int my,float partial){if(!styled)style();background(g,f_96543_,f_96544_,false);brand(g,f_96543_,25,2.2f);center(g,"МОМЕНТ ПЕРЕД НОВЫМ ОТКРЫТИЕМ",f_96543_/2,52,MUTED);for(var child:m_6702_())if(child instanceof Renderable r)r.m_88315_(g,mx,my,partial);center(g,"Твой мир ждёт продолжения",f_96543_/2,f_96544_-16,MUTED);}
    }
    static class Loading extends Overlay {
        final LoadingOverlay original;float progress;
        Loading(LoadingOverlay original){this.original=original;}
        @Override public boolean m_7859_(){return original.m_7859_();}
        @Override public void m_88315_(GuiGraphics g,int mx,int my,float partial){
            original.m_88315_(g,mx,my,partial);
            if(Minecraft.m_91087_().m_91265_()!=this)return;
            try{var field=net.minecraftforge.fml.util.ObfuscationReflectionHelper.findField(LoadingOverlay.class,"f_96164_");var reload=(net.minecraft.server.packs.resources.ReloadInstance)field.get(original);progress=Math.max(progress,reload.m_7750_());}catch(Exception ignored){}
            int w=g.m_280182_(),h=g.m_280206_();background(g,w,h,false);brand(g,w,h/2-37,3);
            center(g,"СОБИРАЕМ ТВОЮ ВСЕЛЕННУЮ",w/2,h/2+3,MUTED);
            int bw=Math.min(240,w-64),x=(w-bw)/2,y=h/2+29;
            g.m_280509_(x,y,x+bw,y+3,0xff34334b);g.m_280509_(x,y,x+(int)(bw*Math.min(1,progress)),y+3,ACCENT);
            center(g,Math.round(progress*100)+"%  ·  Подготовка ресурсов",w/2,y+16,MUTED);
        }
    }
}
