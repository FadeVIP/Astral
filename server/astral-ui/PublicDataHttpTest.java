package astral.atmosphere;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import javax.net.ssl.SSLSession;

public class PublicDataHttpTest {
 record Reply(HttpRequest request,int statusCode,InputStream body) implements HttpResponse<InputStream>{
  public Optional<HttpResponse<InputStream>> previousResponse(){return Optional.empty();}
  public HttpHeaders headers(){return HttpHeaders.of(Map.of(),(a,b)->true);}
  public Optional<SSLSession> sslSession(){return Optional.empty();}
  public URI uri(){return request.uri();}
  public HttpClient.Version version(){return HttpClient.Version.HTTP_1_1;}
 }
 public static void main(String[] args)throws Exception{
  List<String> calls=new ArrayList<>();
  PublicDataHttp.Transport transport=request->{
   String url=request.uri().toString();calls.add(url);
   if(!request.headers().map().isEmpty())throw new AssertionError("Unexpected credentials");
   if(url.startsWith(PublicDataHttp.PRIMARY))throw new IOException("Direct route blocked");
   return new Reply(request,200,new ByteArrayInputStream("{}".getBytes()));
  };
  String url=PublicDataHttp.PRIMARY+"/api/v1/realtime/publicGameData/skins/player.json";
  PublicDataHttp.get(url,8,transport).body().close();
  if(calls.size()!=2||!calls.get(1).startsWith(PublicDataHttp.BACKUP))throw new AssertionError("No fallback");
  calls.clear();PublicDataHttp.get(url,8,transport).body().close();
  if(calls.size()!=1||!calls.get(0).startsWith(PublicDataHttp.BACKUP))throw new AssertionError("Route not remembered");
  try{PublicDataHttp.get("https://untrusted.invalid/api/v1/realtime/x",8,transport);throw new AssertionError("Unexpected host accepted");}catch(IllegalArgumentException expected){}
  System.out.println("PASS public game appearance fallback and credential isolation");
 }
}
