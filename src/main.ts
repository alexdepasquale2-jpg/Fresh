const host = document.getElementById('app')!;
if (location.pathname.startsWith('/dev')) {
  void import('./app/dev').then((m) => m.bootDev(host));
} else {
  void import('./app/main').then((m) => m.boot(host));
}
