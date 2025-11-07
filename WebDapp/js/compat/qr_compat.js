(function(){
  function getParam(n){ try{ return new URL(location.href).searchParams.get(n); }catch(e){ return null; } }
  window.HRKEY_REF_TOKEN = getParam('token') || getParam('ref') || getParam('id') || '';
  // Opcional: expón BASE_URL consistente
  var isLocal = (location.hostname==='localhost'||location.hostname==='127.0.0.1');
  window.HRKEY_BASE_URL = isLocal ? 'https://hrkey.xyz' : location.origin;
})();
