interface Env {
  CLOUDNAV_KV?: any;
  PASSWORD: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
};

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method === 'GET') {
    try {
      let data = null;
      if (env.CLOUDNAV_KV) {
        try {
          data = await env.CLOUDNAV_KV.get('app_data', 'json');
        } catch (e) {
          data = await env.CLOUDNAV_KV.get('app_data');
          if (data && typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch (parseErr) {
              // Keep as is if parse fails
            }
          }
        }
      }

      if (!data) {
        return new Response(JSON.stringify({ links: [], categories: [] }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch data',
        details: err instanceof Error ? err.message : String(err)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  if (request.method === 'POST') {
    try {
      const providedPassword = request.headers.get('x-auth-password');
      const serverPassword = env.PASSWORD;

      if (!serverPassword) {
        return new Response(JSON.stringify({ error: 'Server misconfigured: PASSWORD not set' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      if (providedPassword !== serverPassword) {
        // 临时调试信息 - 部署后请删除此段
        return new Response(JSON.stringify({
          error: 'Unauthorized',
          debug: {
            providedLength: providedPassword?.length || 0,
            serverLength: serverPassword?.length || 0,
            providedFirst3: providedPassword?.substring(0, 3) || '',
            serverFirst3: serverPassword?.substring(0, 3) || '',
            match: providedPassword === serverPassword
          }
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const body = await request.json();

      if (!env.CLOUDNAV_KV) {
        return new Response(JSON.stringify({ error: 'KV storage not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      await env.CLOUDNAV_KV.put('app_data', JSON.stringify(body));

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Failed to save data',
        details: err instanceof Error ? err.message : String(err)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
}

