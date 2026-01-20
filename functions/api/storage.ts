interface Env {
  CLOUDNAV_KV?: any;
  EDGEONE_KV?: any;
  PASSWORD: string;
  // EdgeOne 可能使用的其他 KV 访问方式
  [key: string]: any;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
};

// 获取 KV 实例的辅助函数，支持多种命名方式
function getKV(env: Env) {
  // 尝试从 env 对象获取（Cloudflare 方式）
  if (env.CLOUDNAV_KV) return env.CLOUDNAV_KV;
  if (env.EDGEONE_KV) return env.EDGEONE_KV;
  if (env.CLOUDNAV_DB) return env.CLOUDNAV_DB;

  // 尝试从全局作用域获取（EdgeOne 方式）
  try {
    // @ts-ignore - EdgeOne 可能将 KV 绑定为全局变量
    if (typeof CLOUDNAV_KV !== 'undefined') return CLOUDNAV_KV;
  } catch (e) { }

  try {
    // @ts-ignore
    if (typeof CLOUDNAV_DB !== 'undefined') return CLOUDNAV_DB;
  } catch (e) { }

  return null;
}

export async function onRequest(context: { request: Request; env: Env;[key: string]: any }) {
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
      const kv = getKV(env);
      if (kv) {
        try {
          data = await kv.get('app_data', 'json');
        } catch (e) {
          data = await kv.get('app_data');
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
        const isDebug = env.DEBUG_MODE === 'true';
        const errorResponse: any = { error: 'Unauthorized' };

        if (isDebug) {
          errorResponse.debug = {
            providedLength: providedPassword?.length || 0,
            serverLength: serverPassword?.length || 0,
            providedFirst3: providedPassword?.substring(0, 3) || '',
            serverFirst3: serverPassword?.substring(0, 3) || '',
            match: providedPassword === serverPassword
          };
        }

        return new Response(JSON.stringify(errorResponse), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const body = await request.json();

      const kv = getKV(env);
      const isDebug = env.DEBUG_MODE === 'true';

      if (!kv) {
        const errorResponse: any = { error: 'KV storage not available' };
        if (isDebug) {
          errorResponse.debug = {
            hasCloudnavKV: !!env.CLOUDNAV_KV,
            envKeys: Object.keys(env),
            kvType: typeof env.CLOUDNAV_KV,
            kvValue: env.CLOUDNAV_KV ? 'exists' : 'null/undefined',
            contextKeys: Object.keys(context)
          };
        }
        return new Response(JSON.stringify(errorResponse), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      await kv.put('app_data', JSON.stringify(body));

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

