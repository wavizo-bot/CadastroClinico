/* Cadastro Clínico não usa service worker. Este arquivo existe só para
   substituir um registro antigo deixado por outra aplicação que rodou nesta
   mesma porta: o navegador pedia /service-worker.js para atualizar e recebia o
   HTML do app (resposta inválida), mantendo o worker velho no ar — dele vinha o
   erro "Response body is already used" no console. Ele limpa os caches
   estranhos, se desregistra e recarrega as abas uma única vez. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then((chaves) => Promise.all(chaves.map((chave) => caches.delete(chave)))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const abas = await self.clients.matchAll({ type: "window" });
    for (const aba of abas) aba.navigate(aba.url);
  })());
});
