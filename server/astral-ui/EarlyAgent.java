package astral.early;

import java.lang.instrument.*;
import java.security.*;
import java.util.*;
import java.io.*;

/** Applies only to the exact supported Forge classes, in memory; libraries stay untouched. */
public final class EarlyAgent {
    public static void premain(String options, Instrumentation instrumentation) throws Exception {
        Properties hashes=new Properties();
        try(var in=EarlyAgent.class.getResourceAsStream("/astral-early/hashes.properties")){hashes.load(in);}
        instrumentation.addTransformer(new ClassFileTransformer(){
            @Override public byte[] transform(ClassLoader loader,String name,Class<?> type,ProtectionDomain domain,byte[] bytes){
                String expected=hashes.getProperty(name);
                if(expected==null)return null;
                try {
                    String actual=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                    if(!expected.equals(actual)){System.err.println("[Astral] Early theme skipped: unsupported Forge class "+name);return null;}
                    try(var in=EarlyAgent.class.getResourceAsStream("/astral-early/"+name+".bin")){
                        byte[] replacement=in.readAllBytes();
                        System.out.println("[Astral] Early theme applied: "+name);
                        return replacement;
                    }
                }catch(Exception ex){System.err.println("[Astral] Early theme skipped: "+ex.getClass().getSimpleName());return null;}
            }
        });
    }
}
