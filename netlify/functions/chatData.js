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
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        path: 'data/chatData.json',
        token: process.env.GITHUB_TOKEN
    };

    const githubApi = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;

    try {
        if (event.httpMethod === 'GET') {
            try {
                console.log('Chargement depuis GitHub...');
                const response = await fetch(githubApi, {
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'User-Agent': 'Netlify-Function'
                    }
                });

                if (response.status === 404) {
                    console.log('Fichier GitHub non trouvé, retour données vides');
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ conversations: [], messages: [] })
                    };
                }

                if (!response.ok) {
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
                const newData = JSON.parse(event.body);
                
                if (!newData || typeof newData !== 'object') {
                    throw new Error('Données invalides');
                }

                let sha = null;
                try {
                    const currentFile = await fetch(githubApi, {
                        headers: {
                            'Authorization': `token ${GITHUB_CONFIG.token}`,
                            'User-Agent': 'Netlify-Function'
                        }
                    });
                    
                    if (currentFile.ok) {
                        const currentData = await currentFile.json();
                        sha = currentData.sha;
                    }
                } catch (shaError) {
                    console.log('Fichier n\'existe pas encore, création...');
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
                }

                const updateResponse = await fetch(githubApi, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Netlify-Function'
                    },
                    body: JSON.stringify(updatePayload)
                });

                if (!updateResponse.ok) {
                    const errorData = await updateResponse.text();
                    throw new Error(`GitHub update failed: ${updateResponse.status} - ${errorData}`);
                }

                console.log('Données sauvegardées sur GitHub');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        storage: 'github',
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
                details: error.message
            })
        };
    }
};