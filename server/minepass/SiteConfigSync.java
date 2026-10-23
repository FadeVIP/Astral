package astral.minepass;

import com.google.gson.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.function.LongSupplier;

/** Public configuration only: no login, tokens, player data or world files leave the game. */
final class SiteConfigSync implements AutoCloseable {
    static final String ENDPOINT="https://astral-524a1-default-rtdb.europe-west1.firebasedatabase.app/publicGameData/minepass/astral-local.json";
    static final int LIMIT=700000;
    interface Fetcher {String fetch()throws Exception;}
    private final Fetcher fetcher;
    private final LongSupplier clock;
    private final ExecutorService worker=Executors.newSingleThreadExecutor(r->{Thread t=new Thread(r,"MinePass site settings");t.setDaemon(true);return t;});
    private Future<String> pending;
    private long next;
    private boolean closed;
    SiteConfigSync(){this(()->download(URI.create(ENDPOINT)),System::currentTimeMillis);}
    SiteConfigSync(Fetcher fetcher,LongSupplier clock){this.fetcher=fetcher;this.clock=clock;}
    // Called on the world thread; all network work is isolated in the worker.
    String poll()throws Exception{
        if(closed)return null;
        if(pending!=null&&pending.isDone()){
            Future<String> done=pending;pending=null;
            try{return done.get();}catch(ExecutionException e){throw new IOException("Настройки сайта временно недоступны",e.getCause());}
        }
        if(pending==null&&clock.getAsLong()>=next){next=clock.getAsLong()+30000;pending=worker.submit(()->decode(fetcher.fetch()));}
        return null;
    }
    static String download(URI uri)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)uri.toURL().openConnection();
        connection.setConnectTimeout(5000);connection.setReadTimeout(8000);connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent","Astral-MinePass/0.2.4");
        try{
            if(connection.getResponseCode()!=200)throw new IOException("HTTP "+connection.getResponseCode());
            if(connection.getContentLengthLong()>LIMIT)throw new IOException("Publication too large");
            try(InputStream in=connection.getInputStream()){byte[] bytes=in.readNBytes(LIMIT+1);if(bytes.length>LIMIT)throw new IOException("Publication too large");return new String(bytes,StandardCharsets.UTF_8);}
        }finally{connection.disconnect();}
    }
    static String decode(String raw){
        if(raw==null||raw.length()>LIMIT)throw new IllegalArgumentException("Publication too large");
        var fields=JsonParser.parseString(raw).getAsJsonObject().getAsJsonObject("fields");
        String value=fields.getAsJsonObject("revision").get("integerValue").getAsString();
        if(!value.matches("[1-9][0-9]{0,15}"))throw new IllegalArgumentException("Invalid revision");
        long revision=Long.parseLong(value);if(revision>9007199254740991L)throw new IllegalArgumentException("Invalid revision");
        var json=JsonParser.parseString(fields.getAsJsonObject("config").get("stringValue").getAsString());
        var config=PassCore.JSON.fromJson(json,PassCore.Config.class);PassCore.validate(config);
        if(!"astral-s1".equals(config.season))throw new IllegalArgumentException("Unexpected season");
        JsonObject out=new JsonObject();out.addProperty("revision",revision);out.add("config",json);return out.toString();
    }
    public void close(){closed=true;if(pending!=null)pending.cancel(true);worker.shutdownNow();}
}
