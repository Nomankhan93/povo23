import assert from 'node:assert/strict';

// Chromium network transport and native navigator.onLine can diverge under
// offline emulation. Transport reachability is authoritative for offline
// acceptance; native navigator state remains a diagnostic signal.
export async function browserNetwork(context,page) {
  const session=await context.newCDPSession(page);
  let expectedOffline=false,overrideSupported=true;

  async function verify(stage,{probe=true}={}) {
    const online=await page.evaluate(()=>navigator.onLine);
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

    if(expectedOffline) {
      if(online!==false) {
        console.log(
          `INFO ${stage}: transport is offline while native navigator.onLine=${online}; ` +
          'continuing with transport-authoritative verification',
        );
      }
    } else {
      assert.equal(
        online,
        true,
        `${stage}: browser navigator.onLine=${online}, expected true after reconnect`,
      );
    }

    return {online,reachable};
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

      if(overrideSupported) {
        try {
          await session.send('Network.overrideNetworkState',{
            offline,
            latency:0,
            downloadThroughput:-1,
            uploadThroughput:-1,
          });
        } catch(error) {
          if(!/wasn't found|method not found|-32601/i.test(String(error))){
            throw error;
          }
          overrideSupported=false;
        }
      }

      await verify(offline?'enter offline':'reconnect');
    },

    verify,
  };
}
