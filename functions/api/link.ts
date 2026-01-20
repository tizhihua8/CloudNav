

interface Env {
  CLOUDNAV_KV?: any;
  PASSWORD: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
  'Access-Control-Max-Age': '86400',
};

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === 'POST') {
    const providedPassword = request.headers.get('x-auth-password');
    const serverPassword = env.PASSWORD;

    if (!serverPassword || providedPassword !== serverPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      const newLinkData = await request.json() as any;

      if (!newLinkData.title || !newLinkData.url) {
          return new Response(JSON.stringify({ error: 'Missing title or url' }), { status: 400, headers: corsHeaders });
      }

      let currentData = { links: [], categories: [] };

      if (env.CLOUDNAV_KV) {
        try {
          currentData = await env.CLOUDNAV_KV.get('app_data', 'json');
          if (!currentData) {
            currentData = { links: [], categories: [] };
          }
        } catch (e) {
          const currentDataStr = await env.CLOUDNAV_KV.get('app_data');
          if (currentDataStr) {
            currentData = JSON.parse(currentDataStr);
          }
        }
      }

      let targetCatId = '';
      let targetCatName = '';

      if (newLinkData.categoryId) {
          const explicitCat = currentData.categories.find((c: any) => c.id === newLinkData.categoryId);
          if (explicitCat) {
              targetCatId = explicitCat.id;
              targetCatName = explicitCat.name;
          }
      }

      if (!targetCatId) {
          if (currentData.categories && currentData.categories.length > 0) {
              const keywords = ['inbox', 'temp', 'later', 'collect'];
              const match = currentData.categories.find((c: any) =>
                  keywords.some(k => c.name.toLowerCase().includes(k))
              );

              if (match) {
                  targetCatId = match.id;
                  targetCatName = match.name;
              } else {
                  const common = currentData.categories.find((c: any) => c.id === 'common');
                  if (common) {
                      targetCatId = 'common';
                      targetCatName = common.name;
                  } else {
                      targetCatId = currentData.categories[0].id;
                      targetCatName = currentData.categories[0].name;
                  }
              }
          } else {
              targetCatId = 'common';
              targetCatName = 'Default';
          }
      }

      const newLink = {
          id: Date.now().toString(),
          title: newLinkData.title,
          url: newLinkData.url,
          description: newLinkData.description || '',
          categoryId: targetCatId,
          createdAt: Date.now(),
          pinned: false,
          icon: newLinkData.icon || undefined
      };

      // @ts-ignore
      currentData.links = [newLink, ...(currentData.links || [])];

      if (env.CLOUDNAV_KV) {
          await env.CLOUDNAV_KV.put('app_data', JSON.stringify(currentData));
      }

      return new Response(JSON.stringify({
          success: true,
          link: newLink,
          categoryName: targetCatName
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
}

