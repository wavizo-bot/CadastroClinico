using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace CadastroClinicoMSIX
{
    public class MainForm : Form
    {
        private WebView2 webView;

        private static readonly string LogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "CadastroClinico");
        private static readonly string LogPath = Path.Combine(LogDir, "msix-webview.log");

        public MainForm()
        {
            this.Text = "Cadastro Clínico";
            this.Width = 1280;
            this.Height = 800;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.MinimumSize = new System.Drawing.Size(800, 600);

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            this.Load += async (sender, e) => await LoadAppAsync();
        }

        private async System.Threading.Tasks.Task LoadAppAsync()
        {
            try
            {
                var webPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "web");
                if (!Directory.Exists(webPath) || !File.Exists(Path.Combine(webPath, "index.html")))
                    throw new DirectoryNotFoundException("Conteudo web nao encontrado em: " + webPath);

                // User data em LocalAppData (pasta do pacote e somente-leitura)
                var userData = Path.Combine(LogDir, "WebView2");
                Directory.CreateDirectory(userData);
                var env = await CoreWebView2Environment.CreateAsync(null, userData);
                await webView.EnsureCoreWebView2Async(env);

                // Host virtual: https://cadclinico.app/ -> <exe>\web\
                // (file:// bloqueia modulos ES/CORS; host virtual da origem https
                //  correta p/ modulos, IndexedDB e service worker)
                const string host = "cadclinico.app";
                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    host, webPath, CoreWebView2HostResourceAccessKind.Allow);

                webView.CoreWebView2.NavigationCompleted += async (s, args) =>
                {
                    if (args.IsSuccess)
                    {
                        var json = await webView.CoreWebView2.ExecuteScriptAsync(
                            "JSON.stringify({title:document.title," +
                            "root:(document.getElementById('root')||{}).childElementCount||-1," +
                            "text:(document.body.innerText||'').length})");
                        Log("nav OK " + json);
                    }
                    else
                    {
                        Log("nav FALHOU " + args.WebErrorStatus);
                        try
                        {
                            webView.CoreWebView2.NavigateToString(
                                "<html><body style='font-family:sans-serif;padding:40px'>" +
                                "<h2>Falha ao carregar o aplicativo</h2><p>" +
                                args.WebErrorStatus + "</p></body></html>");
                        }
                        catch { }
                    }
                };

                Log("iniciando " + $"https://{host}/index.html" + " web=" + webPath);
                webView.CoreWebView2.Navigate($"https://{host}/index.html");
            }
            catch (Exception ex)
            {
                Log("ERRO " + ex);
                MessageBox.Show($"Erro ao carregar o aplicativo: {ex.Message}", "Erro", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void Log(string message)
        {
            try
            {
                Directory.CreateDirectory(LogDir);
                File.AppendAllText(LogPath,
                    $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
            catch { }
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            webView?.Dispose();
            base.OnFormClosed(e);
        }
    }
}
