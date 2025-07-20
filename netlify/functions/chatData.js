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
        console.error('GITHUB_TOKEN non défini');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Configuration manquante',
                details: 'GITHUB_TOKEN non défini'
            })
        };
    }

    const githubApi = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;

    try {
        console.log('=== DEBUG START ===');
        console.log('Method:', event.httpMethod);
        console.log('Token exists:', !!process.env.GITHUB_TOKEN);
        console.log('Token length:', process.env.GITHUB_TOKEN?.length || 'UNDEFINED');
        
        if (event.httpMethod === 'GET') {
            try {
                console.log('Chargement depuis GitHub...');
                const response = await fetch(githubApi, {
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'User-Agent': 'Netlify-Function',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                console.log(`Status GitHub GET: ${response.status}`);

                if (response.status === 404) {
                    console.log('Fichier GitHub non trouvé, retour données vides');
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ conversations: [], messages: [] })
                    };
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`GitHub API error: ${response.status} - ${errorText}`);
                    throw new Error(`GitHub API error: ${response.status}`);
                }

                const fileData = await response.json();
                const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                const data = JSON.parse(content);

                console.log('Données chargées depuis GitHub');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(data)
                };

            } catch (error) {
                console.error('Erreur lecture GitHub:', error);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ conversations: [], messages: [] })
                };
            }
        }

        if (event.httpMethod === 'POST') {
            try {
                console.log('Début POST - Body reçu:', event.body?.substring(0, 200));
                
                let newData;
                try {
                    newData = JSON.parse(event.body);
                } catch (parseError) {
                    console.error('Erreur parsing JSON:', parseError);
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            error: 'JSON invalide',
                            details: parseError.message 
                        })
                    };
                }
                
                if (!newData || typeof newData !== 'object') {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: 'Données invalides' })
                    };
                }

                if (!Array.isArray(newData.conversations) || !Array.isArray(newData.messages)) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            error: 'Structure de données invalide',
                            expected: 'conversations et messages doivent être des arrays'
                        })
                    };
                }

                console.log(`Données valides: ${newData.conversations.length} conversations, ${newData.messages.length} messages`);

                let sha = null;
                try {
                    console.log('Récupération du SHA...');
                    const currentFile = await fetch(githubApi, {
                        headers: {
                            'Authorization': `token ${GITHUB_CONFIG.token}`,
                            'User-Agent': 'Netlify-Function',
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    
                    console.log(`Status récupération SHA: ${currentFile.status}`);
                    
                    if (currentFile.ok) {
                        const currentData = await currentFile.json();
                        sha = currentData.sha;
                        console.log('SHA récupéré:', sha?.substring(0, 8) + '...');
                    } else if (currentFile.status !== 404) {
                        const errorText = await currentFile.text();
                        console.error('Erreur récupération SHA:', errorText);
                    }
                } catch (shaError) {
                    console.log('Fichier n\'existe pas encore, création...', shaError.message);
                }

                const content = JSON.stringify(newData, null, 2);
                const encodedContent = Buffer.from(content).toString('base64');
                const updatePayload = {
                    message: `Update chat data - ${new Date().toISOString()}`,
                    content: encodedContent,
                    branch: 'main'
                };

                if (sha) {
                    updatePayload.sha = sha;
                    console.log('Mise à jour avec SHA');
                } else {
                    console.log('Création nouveau fichier');
                }

                console.log('Envoi vers GitHub...');
                const updateResponse = await fetch(githubApi, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Netlify-Function',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify(updatePayload)
                });

                console.log(`Status GitHub PUT: ${updateResponse.status}`);

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.text();
                    console.error(`GitHub update failed: ${updateResponse.status} - ${errorData}`);
                    
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ 
                            error: 'Erreur GitHub API',
                            status: updateResponse.status,
                            details: errorData
                        })
                    };
                }

                const result = await updateResponse.json();
                console.log('Sauvegarde GitHub réussie');
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        storage: 'github',
                        sha: result.content?.sha,
                        timestamp: new Date().toISOString()
                    })
                };

            } catch (saveError) {
                console.error('Erreur sauvegarde GitHub:', saveError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        error: 'Erreur sauvegarde GitHub',
                        details: saveError.message 
                    })
                };
            }
        }

        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };

    } catch (error) {
        console.error('Erreur function:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur serveur', 
                details: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            })
        };
    }
};
