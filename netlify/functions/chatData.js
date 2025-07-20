const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const GITHUB_CONFIG = {
        owner: 'thozz-joao-dev',
        repo: 'thozz-joao-dev.github.io',
        path: 'data/chatData.json',
        token: process.env.GITHUB_TOKEN
    };

    if (!GITHUB_CONFIG.token) {
        console.error('❌ GITHUB_TOKEN non défini');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Configuration manquante',
                details: 'GITHUB_TOKEN non défini dans les variables d\'environnement'
            })
        };
    }

    const githubApi = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;

    try {
        if (event.httpMethod === 'GET') {
            console.log('📥 GET - Chargement depuis GitHub...');
            
            try {
                const response = await fetch(githubApi, {
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'User-Agent': 'Netlify-Function',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 10000
                });

                console.log(`📡 Status GitHub GET: ${response.status}`);

                if (response.status === 404) {
                    console.log('📝 Fichier non trouvé, retour données vides');
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ conversations: [], messages: [] })
                    };
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`❌ GitHub API error: ${response.status} - ${errorText}`);
                    throw new Error(`GitHub API error: ${response.status}`);
                }

                const fileData = await response.json();
                const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                const data = JSON.parse(content);

                console.log('✅ Données chargées depuis GitHub');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(data)
                };

            } catch (error) {
                console.error('❌ Erreur lecture GitHub:', error.message);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ conversations: [], messages: [] })
                };
            }
        }

        if (event.httpMethod === 'POST') {
            console.log('📤 POST - Début sauvegarde...');
            
            // Validation du body
            if (!event.body) {
                console.error('❌ Body vide');
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Body manquant' })
                };
            }

            let newData;
            try {
                newData = JSON.parse(event.body);
                console.log(`📊 JSON parsé: ${newData.conversations?.length || 0} conversations, ${newData.messages?.length || 0} messages`);
            } catch (parseError) {
                console.error('❌ Erreur parsing JSON:', parseError.message);
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'JSON invalide',
                        details: parseError.message 
                    })
                };
            }

            // Validation structure
            if (!newData || typeof newData !== 'object' || 
                !Array.isArray(newData.conversations) || 
                !Array.isArray(newData.messages)) {
                console.error('❌ Structure invalide');
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Structure de données invalide',
                        expected: 'Objet avec arrays conversations et messages'
                    })
                };
            }

            try {
                // 1. Récupérer le SHA actuel
                console.log('🔍 Récupération du SHA...');
                let sha = null;
                
                const currentResponse = await fetch(githubApi, {
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'User-Agent': 'Netlify-Function',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 10000
                });
                
                console.log(`📡 Status récupération SHA: ${currentResponse.status}`);
                
                if (currentResponse.ok) {
                    const currentData = await currentResponse.json();
                    sha = currentData.sha;
                    console.log(`🔑 SHA récupéré: ${sha.substring(0, 8)}...`);
                } else if (currentResponse.status === 404) {
                    console.log('📝 Fichier n\'existe pas, création...');
                } else {
                    const errorText = await currentResponse.text();
                    console.error(`❌ Erreur récupération SHA: ${currentResponse.status} - ${errorText}`);
                    throw new Error(`Impossible de récupérer le SHA: ${currentResponse.status}`);
                }

                // 2. Préparer le payload
                const content = JSON.stringify(newData, null, 2);
                const encodedContent = Buffer.from(content, 'utf8').toString('base64');
                
                const updatePayload = {
                    message: `Update chat data - ${new Date().toISOString()}`,
                    content: encodedContent,
                    branch: 'main'
                };

                if (sha) {
                    updatePayload.sha = sha;
                }

                console.log(`💾 ${sha ? 'Mise à jour' : 'Création'} du fichier...`);

                // 3. Sauvegarder sur GitHub
                const updateResponse = await fetch(githubApi, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Netlify-Function',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify(updatePayload),
                    timeout: 15000
                });

                console.log(`📡 Status GitHub PUT: ${updateResponse.status}`);

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.text();
                    console.error(`❌ GitHub update failed: ${updateResponse.status} - ${errorData}`);
                    
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ 
                            error: 'Échec sauvegarde GitHub',
                            status: updateResponse.status,
                            details: errorData.substring(0, 500) // Limiter pour éviter les gros logs
                        })
                    };
                }

                const result = await updateResponse.json();
                console.log('✅ Sauvegarde GitHub réussie');
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true,
                        storage: 'github',
                        sha: result.content?.sha,
                        size: content.length,
                        timestamp: new Date().toISOString()
                    })
                };

            } catch (saveError) {
                console.error('❌ Erreur dans la sauvegarde:', saveError.message);
                console.error('Stack:', saveError.stack);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Erreur lors de la sauvegarde',
                        details: saveError.message,
                        type: saveError.constructor.name
                    })
                };
            }
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };

    } catch (error) {
        console.error('❌ Erreur générale:', error.message);
        console.error('Stack:', error.stack);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur serveur interne',
                details: error.message,
                type: error.constructor.name
            })
        };
    }
};
