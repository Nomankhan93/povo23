import assert from 'node:assert/strict';

// Chromium network transport and native navigator.onLine can diverge under
// offline emulation. Both native state and real transport must match the
// requested state before capture or navigation is accepted.
export async function browserNetwork(context,page) {
  const session=await context.newCDPSession(page);
  let expectedOffline=false,overrideSupported=true,pendingNavigation=Promise.resolve();

  // Test-only startup adapter. Capture the genuine getter separately; the
  // adapter is never evidence that HTTP transport is blocked.
  function installStartupAdapter(){
    const nativeGetter=Object.getOwnPropertyDescriptor(Navigator.prototype,'onLine').get;
    Object.defineProperty(window,'fieldlanceNativeOnline',{get:()=>nativeGetter.call(navigator)});
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>localStorage.getItem('fixture-offline')==='yes'?false:nativeGetter.call(navigator)});
  }
  await context.addInitScript(installStartupAdapter);
  await page.evaluate(installStartupAdapter);
  async function alignNative(){
    if(!overrideSupported)return;
    try{await session.send('Network.overrideNetworkState',{offline:expectedOffline,latency:0,downloadThroughput:-1,uploadThroughput:-1})}
    catch(error){if(!/wasn't found|method not found|-32601/i.test(String(error)))throw error;overrideSupported=false;}
  }
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())pendingNavigation=alignNative()});

  async function verify(stage,{probe=true}={}) {
    await pendingNavigation;
    const {online,nativeOnline}=await page.evaluate(()=>({online:navigator.onLine,nativeOnline:window.fieldlanceNativeOnline}));
    let reachable=null;

    if(probe) {
      reachable=await page.evaluate(async()=>{
        try {
          const response=await fetch(
            '/fixture-network-probe?nonce='+crypto.randomUUID(),
            {
              cache:'no-store',
              signal:AbortSignal.timeout(5000),
            },
          );
          return response.ok;
        } catch {
          return false;
        }
      });

      assert.equal(
        reachable,
        !expectedOffline,
        `${stage}: uncached network probe disagrees with requested offline state`,
      );
    }

    assert.equal(nativeOnline,!expectedOffline,`${stage}: native navigator.onLine disagrees with requested connection state`);
    assert.equal(online,!expectedOffline,`${stage}: application online signal disagrees with requested connection state`);

    return {online,nativeOnline,reachable};
  }

  return {
    async reproduceMismatch() {
      await context.setOffline(true);

      await session.send('Network.overrideNetworkState',{
        offline:false,
        latency:0,
        downloadThroughput:-1,
        uploadThroughput:-1,
      });

      assert.equal(
        await page.evaluate(()=>navigator.onLine),
        true,
      );

      const reachable=await page.evaluate(async()=>{
        try {
          return (
            await fetch(
              '/fixture-network-probe?nonce='+crypto.randomUUID(),
              {
                cache:'no-store',
                signal:AbortSignal.timeout(5000),
              },
            )
          ).ok;
        } catch {
          return false;
        }
      });

      assert.equal(
        reachable,
        false,
        'Mismatch reproduction must block transport while navigator reports online',
      );
    },

    get offline(){
      return expectedOffline;
    },

    async set(offline) {
      expectedOffline=offline;

      // The fixture Supabase client is in-process and does not use Chromium's
      // real HTTP transport. Mirror the requested network state explicitly so
      // simulated server operations fail while the browser transport is offline.
      await page.evaluate((offline)=>{
        if(offline) {
          localStorage.setItem('fixture-offline','yes');
        } else {
          localStorage.removeItem('fixture-offline');
        }
      },offline);

      await context.setOffline(offline);

      await alignNative();

      await verify(offline?'enter offline':'reconnect');
    },

    verify,
  };
}
