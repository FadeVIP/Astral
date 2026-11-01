package astral.atmosphere;

import java.io.InputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** Only public appearance data; never sends account credentials to the game. */
final class PublicDataHttp {
 static final String PRIMARY="https://829504-vds-korolevikh2001vlad.gmhost.pp.ua";
 static final String BACKUP="https://astral-tib9.onrender.com";
 private static final HttpClient HTTP=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).followRedirects(HttpClient.Redirect.NEVER).build();
 private static volatile long backupUntil;
 interface Transport { HttpResponse<InputStream> send(HttpRequest request)throws IOException,InterruptedException; }
 static HttpResponse<InputStream> get(String address,int seconds)throws IOException,InterruptedException {
  return get(address,seconds,r->HTTP.send(r,HttpResponse.BodyHandlers.ofInputStream()));
 }
 static HttpResponse<InputStream> get(String address,int seconds,Transport transport)throws IOException,InterruptedException {
  URI uri=URI.create(address);
  if(!address.startsWith(PRIMARY+"/api/v1/realtime/")||uri.getRawUserInfo()!=null||uri.getFragment()!=null)throw new IllegalArgumentException("Not public Astral data");
  String suffix=address.substring(PRIMARY.length());
  boolean backup=System.currentTimeMillis()<backupUntil;
  String first=backup?BACKUP:PRIMARY,second=backup?PRIMARY:BACKUP;
  try{
   var response=transport.send(HttpRequest.newBuilder(URI.create(first+suffix)).timeout(Duration.ofSeconds(3)).GET().build());
   if(response.statusCode()<500)return response;
   response.body().close();
  }catch(IOException failure){/* Read-only retry on the other known endpoint. */}
  var response=transport.send(HttpRequest.newBuilder(URI.create(second+suffix)).timeout(Duration.ofSeconds(Math.max(4,seconds))).GET().build());
  if(response.statusCode()<500)backupUntil=second.equals(BACKUP)?System.currentTimeMillis()+60000:0;
  return response;
 }
}
