/* =========================================================
   CARNET SPIRITUEL — Service Worker
   - Met en cache l'app shell (HTML, manifest, icônes) pour un
     fonctionnement hors-ligne.
   - Ne touche JAMAIS à localStorage : les données utilisateur
     (profil, entrées journalières) vivent uniquement dans
     localStorage, un espace de stockage totalement séparé du
     Cache Storage utilisé ici. Vider ou renouveler ce cache ne
     supprime donc jamais les données de l'utilisateur.
   - CACHE_VERSION doit être incrémenté à chaque déploiement pour
     forcer la mise à jour du cache ; les anciens caches sont
     supprimés automatiquement à l'activation.
========================================================= */

var CACHE_VERSION = "cs-cache-v1";

/* Fichiers de l'app shell : à adapter si vous ajoutez des fichiers
   (ex: styles.css, app.js) séparés du index.html. */
var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
];

/* ---------- Installation : mise en cache de l'app shell ---------- */
self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache){
      return cache.addAll(APP_SHELL);
    }).then(function(){
      return self.skipWaiting(); /* active la nouvelle version sans attendre la fermeture des onglets */
    })
  );
});

/* ---------- Activation : nettoyage des anciens caches ---------- */
self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){ return key !== CACHE_VERSION; })
            .map(function(key){ return caches.delete(key); })
      );
    }).then(function(){
      return self.clients.claim(); /* prend le contrôle immédiatement, sans réinstallation */
    })
  );
});

/* ---------- Stratégie réseau ----------
   - Navigation (chargement de page) : réseau en priorité, avec
     repli sur le cache si hors-ligne (garantit la version la plus
     récente quand une connexion est disponible, tout en
     fonctionnant hors-ligne).
   - Autres ressources (icônes, manifest) : cache en priorité,
     avec mise à jour silencieuse en arrière-plan (stale-while-revalidate).
   Seules les requêtes GET sont interceptées ; tout le reste
   (aucune requête serveur n'est utilisée par cette app) passe
   normalement.
*/
self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;

  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return; /* ignore les ressources externes (CDN, etc.) */

  if(req.mode === "navigate"){
    event.respondWith(
      fetch(req).then(function(res){
        var resClone = res.clone();
        caches.open(CACHE_VERSION).then(function(cache){ cache.put(req, resClone); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match("./index.html");
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function(cached){
      var networkFetch = fetch(req).then(function(res){
        if(res && res.status === 200){
          var resClone = res.clone();
          caches.open(CACHE_VERSION).then(function(cache){ cache.put(req, resClone); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || networkFetch;
    })
  );
});

/* ---------- Mise à jour immédiate sur demande de la page ---------- */
self.addEventListener("message", function(event){
  if(event.data === "SKIP_WAITING") self.skipWaiting();
});
