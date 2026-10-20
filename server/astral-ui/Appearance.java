package astral.atmosphere;

import com.google.gson.Gson;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class Appearance {
    static class Layout {int schema,overlay;boolean stars;String title,subtitle,footer,titleColor,textColor,backgroundFile;List<Row> buttons;}
    static class Row {String id,action,label,url,icon,color,textColor;int x,y,width,height;boolean visible;}
    static final Gson JSON=new Gson();
    static String imageName="",failedImage="";static ResourceLocation texture;static int imageWidth,imageHeight;
    static Path directory(){return Minecraft.m_91087_().f_91069_.toPath().resolve("config/astral-atmosphere");}
    static Layout load(){
        try{Path file=directory().resolve("appearance.json");if(Files.exists(file)){if(Files.size(file)>50000)throw new IllegalArgumentException("Config too large");return validate(JSON.fromJson(Files.readString(file),Layout.class));}}
        catch(Exception e){System.err.println("[Astral Atmosphere] Using default layout: "+e.getMessage());}
        try(var input=Appearance.class.getResourceAsStream("/atmosphere-default.json")){return validate(JSON.fromJson(new String(input.readAllBytes(),StandardCharsets.UTF_8),Layout.class));}
        catch(Exception e){throw new IllegalStateException("Missing default Astral layout",e);}
    }
    static int color(String s){if(s==null||!s.matches("#[a-fA-F0-9]{6}"))throw new IllegalArgumentException("Invalid color");return (int)(0xff000000L|Long.parseLong(s.substring(1),16));}
    static void text(String s,int max){if(s==null||s.length()>max||s.chars().anyMatch(c->c<32))throw new IllegalArgumentException("Invalid text");}
    static Layout validate(Layout c){
        if(c==null||c.schema!=1||c.buttons==null||c.buttons.size()<2||c.buttons.size()>16||c.overlay<0||c.overlay>90)throw new IllegalArgumentException("Invalid layout");
        text(c.title,32);text(c.subtitle,80);text(c.footer,100);color(c.titleColor);color(c.textColor);
        Set<String> ids=new HashSet<>();int play=0,quit=0;
        for(var b:c.buttons){
            if(b.id==null||!b.id.matches("[a-z][a-z0-9-]{0,39}")||!ids.add(b.id)||!List.of("play","network","settings","quit","link","friends").contains(b.action)||!List.of("","globe","discord","telegram","heart").contains(b.icon))throw new IllegalArgumentException("Invalid button");
            text(b.label,32);color(b.color);color(b.textColor);
            if(b.width<24||b.width>600||b.height<20||b.height>64||b.x<0||b.y<72||b.x+b.width>640||b.y+b.height>334)throw new IllegalArgumentException("Button outside layout");
            if(b.action.equals("link")){var u=java.net.URI.create(b.url);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||b.url.length()>500)throw new IllegalArgumentException("Invalid link");}
            if(b.visible&&b.action.equals("play"))play++;if(b.visible&&b.action.equals("quit"))quit++;
        }
        if(play!=1||quit!=1)throw new IllegalArgumentException("Play and quit must be visible");
        for(int i=0;i<c.buttons.size();i++)for(int j=i+1;j<c.buttons.size();j++){var a=c.buttons.get(i);var b=c.buttons.get(j);if(a.visible&&b.visible&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)throw new IllegalArgumentException("Buttons overlap");}
        if(c.backgroundFile!=null&&!c.backgroundFile.isEmpty()&&!c.backgroundFile.matches("background-[a-f0-9]{64}\\.png"))throw new IllegalArgumentException("Invalid background path");return c;
    }
    static void background(GuiGraphics g,int width,int height,Layout c){
        ResourceLocation image=AstralAtmosphere.BACKDROP;int iw=1672,ih=941;
        if(c.backgroundFile!=null&&!c.backgroundFile.isEmpty()&&!c.backgroundFile.equals(failedImage))try{
            if(!c.backgroundFile.equals(imageName)){
                Path file=directory().resolve(c.backgroundFile);if(Files.isSymbolicLink(file)||Files.size(file)>5000000)throw new IllegalArgumentException("Invalid image");
                try(var input=Files.newInputStream(file)){var pixels=NativeImage.m_85058_(input);if(pixels.m_84982_()>1280||pixels.m_85084_()>720){pixels.close();throw new IllegalArgumentException("Image too large");}imageWidth=pixels.m_84982_();imageHeight=pixels.m_85084_();var manager=Minecraft.m_91087_().m_91097_();if(texture!=null)manager.m_118513_(texture);texture=manager.m_118490_("astral-appearance",new DynamicTexture(pixels));imageName=c.backgroundFile;}
            }image=texture;iw=imageWidth;ih=imageHeight;
        }catch(Exception e){failedImage=c.backgroundFile;System.err.println("[Astral Atmosphere] Background fallback: "+e.getMessage());}
        g.m_280168_().m_85836_();float scale=Math.max(width/(float)iw,height/(float)ih);g.m_280168_().m_252880_((width-iw*scale)/2,(height-ih*scale)/2,0);g.m_280168_().m_85841_(scale,scale,1);g.m_280163_(image,0,0,0,0,iw,ih,iw,ih);g.m_280168_().m_85849_();
        g.m_280509_(0,0,width,height,((c.overlay*255/100)<<24)|0x0b1020);
        if(c.stars){double time=System.nanoTime()/1e9;for(int i=0;i<72;i++){int x=Math.floorMod(i*7919+41,width),y=Math.floorMod(i*3571+71,height),alpha=(int)(55+60*(1+Math.sin(time*.4+i)));g.m_280509_(x,y,x+1,y+1,(alpha<<24)|0xc4cfee);}}
    }
    static class ConfigButton extends Button {
        final Row row;
        ConfigButton(Row b,int screenWidth,int screenHeight,Runnable action){super(Math.round(b.x*screenWidth/640f),Math.round(b.y*screenHeight/360f),Math.max(16,Math.round(b.width*screenWidth/640f)),Math.max(14,Math.round(b.height*screenHeight/360f)),Component.m_237113_(b.label),v->action.run(),f_252438_);row=b;m_257544_(Tooltip.m_257550_(Component.m_237113_(b.label)));}
        @Override protected void m_87963_(GuiGraphics g,int mx,int my,float partial){
            int x=m_252754_(),y=m_252907_(),w=m_5711_(),h=m_93694_();g.m_280509_(x,y,x+w,y+h,color(row.color));g.m_280509_(x,y,x+1,y+h,color(row.textColor));if(m_198029_())g.m_280509_(x,y,x+w,y+h,0x22ffffff);
            int icon=List.of("globe","discord","telegram","heart").indexOf(row.icon);
            if(icon>=0){int pixel=Math.max(1,Math.min((w-6)/9,(h-6)/9)),ox=x+(w-9*pixel)/2,oy=y+(h-9*pixel)/2;for(int r=0;r<9;r++)for(int col=0;col<9;col++)if(AstralAtmosphere.SocialButton.PIXELS[icon][r].charAt(col)=='#')g.m_280509_(ox+col*pixel,oy+r*pixel,ox+(col+1)*pixel,oy+(r+1)*pixel,color(row.textColor));}
            else{var font=Minecraft.m_91087_().f_91062_;String label=row.action.equals("friends")?"Друзья · "+FriendsMenu.online():row.label;while(label.length()>1&&font.m_92895_(label)>w-6)label=label.substring(0,label.length()-1);AstralAtmosphere.text(g,label,x+(w-font.m_92895_(label))/2,y+(h-8)/2,color(row.textColor));}
        }
    }
}
