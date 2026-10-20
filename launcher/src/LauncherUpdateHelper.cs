using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;

public class UpdateJob {
    public int parentPid { get; set; }
    public string source { get; set; }
    public string target { get; set; }
    public string stage { get; set; }
    public string backup { get; set; }
    public string sha256 { get; set; }
    public long bytes { get; set; }
    public bool restart { get; set; }
}
public static class LauncherUpdateHelper {
    static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
    static string Hash(string file) {
        using (var stream = File.OpenRead(file))
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
    }
    static bool Same(string a, string b) { return String.Equals(a, b, StringComparison.OrdinalIgnoreCase); }
    static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    static void Start(string file) {
        Process.Start(new ProcessStartInfo(file) {
            WorkingDirectory = Path.GetDirectoryName(file), UseShellExecute = false,
            CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
        });
    }
    [STAThread]
    public static int Main(string[] args) {
        if (args.Length != 1) return 2;
        string jobFile = Path.GetFullPath(args[0]);
        UpdateJob job = null; bool validated = false, moved = false, replaced = false;
        try {
            job = new JavaScriptSerializer().Deserialize<UpdateJob>(File.ReadAllText(jobFile, Utf8));
            Require(job != null, "Missing update job");
            string[] paths = { job.source, job.target, job.stage, job.backup };
            foreach (string item in paths) {
                Require(!String.IsNullOrEmpty(item) && item.Length > 3 && Char.IsLetter(item[0]) && item[1] == ':' && (item[2] == '\\' || item[2] == '/'), "Absolute local paths required");
                Require(Same(Path.GetFullPath(item), item), "Paths must be normalized");
            }
            string folder = Path.GetDirectoryName(job.target);
            Require(Same(Path.GetExtension(job.target), ".exe"), "Unexpected target type");
            Require(Same(Path.GetDirectoryName(job.stage), folder) && Same(Path.GetDirectoryName(job.backup), folder), "Update files must be beside target");
            for (int a = 0; a < paths.Length; a++) for (int b = a + 1; b < paths.Length; b++) Require(!Same(paths[a], paths[b]), "Update paths overlap");
            Require(!File.Exists(job.stage) && !Directory.Exists(job.stage) && !File.Exists(job.backup) && !Directory.Exists(job.backup), "Update destination exists");
            Require(File.Exists(job.target) && (File.GetAttributes(job.target) & FileAttributes.ReparsePoint) == 0, "Target must be a regular file");
            validated = true;
            Require(new FileInfo(job.source).Length == job.bytes && Hash(job.source) == job.sha256, "Update checksum mismatch");
            File.WriteAllText(jobFile + ".ready", "READY", Utf8);
            if (job.parentPid > 0) {
                Process parent = null;
                try { parent = Process.GetProcessById(job.parentPid); } catch (ArgumentException) { }
                if (parent != null) using (parent) Require(parent.WaitForExit(120000), "Launcher did not exit");
            }
            File.Copy(job.source, job.stage, false);
            Require(Hash(job.stage) == job.sha256, "Staged checksum mismatch");
            for (int attempt = 0; ; attempt++) {
                try { File.Move(job.target, job.backup); moved = true; break; }
                catch (IOException) { if (attempt >= 59) throw; Thread.Sleep(1000); }
                catch (UnauthorizedAccessException) { if (attempt >= 59) throw; Thread.Sleep(1000); }
            }
            File.Move(job.stage, job.target); replaced = true;
            if (job.restart) Start(job.target);
            File.WriteAllText(jobFile + ".result", "UPDATED", Utf8);
            return 0;
        } catch (Exception error) {
            string detail = error.Message;
            try {
                if (replaced && moved) File.Delete(job.target);
                if (moved) { File.Move(job.backup, job.target); if (job.restart) Start(job.target); }
            } catch (Exception rollback) { detail += "; rollback: " + rollback.Message; }
            try { File.WriteAllText(jobFile + ".result", "FAILED: " + detail, Utf8); } catch { }
            return 1;
        } finally {
            if (validated && File.Exists(job.stage)) try { File.Delete(job.stage); } catch { }
        }
    }
}
