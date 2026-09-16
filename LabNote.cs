using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;

namespace LabNote
{
    internal static class Program
    {
        private const string ServerUrl = "http://127.0.0.1:8002/";
        private const string Host = "127.0.0.1";
        private const int Port = 8002;
        private const string AppName = "電子実験ノート";

        [STAThread]
        private static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string exePath = Assembly.GetExecutingAssembly().Location;
            string pythonExe = Path.Combine(baseDir, ".venv", "Scripts", "python.exe");

            // 1. ショートカット作成 (デスクトップ & スタートメニュー)
            EnsureShortcuts(baseDir, exePath);

            // 2. サーバー起動確認 (ポート8002)
            if (!IsPortOpen(Host, Port))
            {
                StartServer(baseDir, pythonExe);

                // ポートが開くまで待機 (最大15秒)
                int waitedMs = 0;
                while (!IsPortOpen(Host, Port) && waitedMs < 15000)
                {
                    Thread.Sleep(200);
                    waitedMs += 200;
                }
            }

            // 3. ブラウザでアプリ画面を表示
            LaunchBrowser(baseDir);
        }

        private static bool IsPortOpen(string host, int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(400, false);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void StartServer(string baseDir, string pythonExe)
        {
            string targetExe = pythonExe;
            if (!File.Exists(targetExe))
            {
                string altPy = Path.Combine(baseDir, ".venv", "python.exe");
                if (File.Exists(altPy))
                {
                    targetExe = altPy;
                }
            }

            if (File.Exists(targetExe))
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = targetExe,
                    Arguments = "-m uvicorn main:app --host 127.0.0.1 --port 8002",
                    WorkingDirectory = baseDir,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
        }

        private static void LaunchBrowser(string baseDir)
        {
            string profileDir = Path.Combine(baseDir, ".edge_profile");
            string edgeArgs = string.Format("--user-data-dir=\"{0}\" --app={1}", profileDir, ServerUrl);

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "msedge.exe",
                    Arguments = edgeArgs,
                    UseShellExecute = true
                };
                Process.Start(psi);
            }
            catch
            {
                // Edge起動失敗時は既定のブラウザで開く
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = ServerUrl,
                        UseShellExecute = true
                    });
                }
                catch
                {
                }
            }
        }

        private static void EnsureShortcuts(string baseDir, string exePath)
        {
            try
            {
                // 1. デスクトップ
                string markerPath = Path.Combine(baseDir, ".shortcut_created");
                if (File.Exists(markerPath))
                {
                    return;
                }

                // 1. デスクトップ (初回起動時のみ作成)
                string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (Directory.Exists(desktopDir))
                {
                    string lnkPath = Path.Combine(desktopDir, AppName + ".lnk");
                    CreateShortcut(lnkPath, exePath, baseDir, "電子実験ノート - 研究プロトコル・実験記録システム");
                }

                // 2. スタートメニュー (プログラム)
                string programsDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                if (Directory.Exists(programsDir))
                {
                    string lnkPath = Path.Combine(programsDir, AppName + ".lnk");
                    CreateShortcut(lnkPath, exePath, baseDir, "電子実験ノート - 研究プロトコル・実験記録システム");
                }

                // 初回ショートカット作成完了マーカーを保存
                File.WriteAllText(markerPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            }
            catch
            {
            }
        }

        private static void CreateShortcut(string lnkPath, string targetPath, string workDir, string desc)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;

                object shell = Activator.CreateInstance(shellType);
                object shortcut = shellType.InvokeMember(
                    "CreateShortcut",
                    BindingFlags.InvokeMethod,
                    null,
                    shell,
                    new object[] { lnkPath }
                );

                Type scType = shortcut.GetType();
                scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workDir });
                scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { desc });
                scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath + ",0" });
                scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            catch
            {
            }
        }
    }
}
