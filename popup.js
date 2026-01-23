document.addEventListener('DOMContentLoaded', function() {
    console.log("Extensão iniciada.");

    let geoJsonData = null; 
    let geoJsonUBS = null;   
    let bairroCache = "";

    const arquivoUVIS = 'Territórios_UVIS.geojson';
    const arquivoUBS = 'Territorios_UBS.geojson';

    const btn = document.getElementById('btn-consultar');

 
    Promise.all([
        fetch(chrome.runtime.getURL(arquivoUVIS)).then(r => r.json()),
        fetch(chrome.runtime.getURL(arquivoUBS)).then(r => r.json())
    ])
    .then(([dataUVIS, dataUBS]) => {
        geoJsonData = dataUVIS;
        geoJsonUBS = dataUBS;
        console.log("Todas as bases carregadas!");
        if (btn) {
            btn.innerText = "🔍 CONSULTAR";
            btn.disabled = false;
        }
    })
    .catch(err => {
        console.error("Erro ao ler arquivos:", err);
        const title = document.querySelector('h3');
        if (title) {
            title.innerText = "❌ ERRO: Bases não encontradas";
            title.style.color = "red";
        }
        alert(`ATENÇÃO: Não consegui ler os arquivos GeoJSON.\nVerifique se eles estão na pasta.`);
    });

 
    const cepInput = document.getElementById('cep');
    if (cepInput) {
        cepInput.addEventListener('blur', function() {
            let cep = this.value.replace(/\D/g, '');
            if (cep.length === 8) {
                fetch(`https://viacep.com.br/ws/${cep}/json/`)
                    .then(res => res.json())
                    .then(data => {
                        if (!data.erro) {
                            document.getElementById('logradouro').value = data.logradouro;
                            bairroCache = data.bairro;
                        }
                    })
                    .catch(err => console.log("Erro no ViaCEP", err));
            }
        });
    }

 
    if (btn) {
        btn.addEventListener('click', function() {
            const rua = document.getElementById('logradouro').value;
            const num = document.getElementById('numero').value;
            const cepVal = document.getElementById('cep').value;

            if (!rua) return alert("Preencha o logradouro.");

            const loading = document.getElementById('loading');
            const results = document.getElementById('results-area');

            btn.style.display = 'none';
            loading.style.display = 'block';
            results.style.display = 'none';

            const query = `${rua}, ${num}, São Paulo, Brasil`;
            
 
            const cacheKey = `geo_${query.toLowerCase().replace(/\s/g, '_')}`;
            const cachedData = localStorage.getItem(cacheKey);

            const processarDados = (data) => {
                loading.style.display = 'none';
                btn.style.display = 'block';

                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);

 
                    document.getElementById('res-log').innerText = rua + (num ? `, ${num}` : '');
                    
                    let cepEncontrado = cepVal;
                    if (!cepEncontrado && data[0].address && data[0].address.postcode) {
                        cepEncontrado = data[0].address.postcode;
                    }
                    document.getElementById('res-cep').innerText = cepEncontrado || "Não informado";

                    let bairroMapa = "";
                    if (data[0].address) {
                        bairroMapa = data[0].address.suburb || data[0].address.neighbourhood || data[0].address.residential || data[0].address.city_district || "";
                    }
                    const bairroFinal = bairroCache || bairroMapa || "Não identificado";
                    document.getElementById('res-bairro').innerText = bairroFinal;

 
                    if (typeof turf !== 'undefined' && geoJsonData) {
                        const ponto = turf.point([lon, lat]);
                        
                        let candidatosUVIS = [];
                        let candidatosDA = [];

 
                        turf.featureEach(geoJsonData, function(feat) {
                            if (turf.booleanPointInPolygon(ponto, feat)) {
                                const props = feat.properties;
                                for (const [key, value] of Object.entries(props)) {
                                    const k = key.toLowerCase();
                                    const v = String(value).trim();

 
                                    if (k.includes('uvis')) {
                                        let pontos = 0;
                                        if (k.includes('nome') || k.includes('nm')) pontos += 20;
                                        if (isNaN(v)) pontos += 10;
                                        candidatosUVIS.push({ valor: v, pontos: pontos });
                                    }

 
                                    if (k.includes('da') || k.includes('distrito')) {
                                        let pontos = 0;
                                        
 
                                        if (k.includes('nome') || k.includes('nm')) pontos += 100;
                                        
 
                                        if (k.includes('cod') || k.includes('cd') || k.includes('id')) pontos -= 100;
                                        
                                        
                                        if (!isNaN(v.replace(',', '.'))) {
                                            pontos -= 50;  
                                        } else {
                                            pontos += 50;  
                                        }

                                        candidatosDA.push({ valor: v, pontos: pontos });
                                    }
                                }
                            }
                        });

                        candidatosUVIS.sort((a, b) => b.pontos - a.pontos);
                        candidatosDA.sort((a, b) => b.pontos - a.pontos);

                        document.getElementById('res-uvis').innerText = candidatosUVIS.length > 0 ? candidatosUVIS[0].valor : "Fora da área mapeada";
                        document.getElementById('res-da').innerText = candidatosDA.length > 0 ? candidatosDA[0].valor : "Fora da área mapeada";

 
                        let nomeUBS = "Não localizada na base";
                        let achouUBS = false;

                        if (geoJsonUBS) {
                            turf.featureEach(geoJsonUBS, function(feat) {
                                if (achouUBS) return; 
                                
 
                                if (feat.geometry.type !== 'Polygon' && feat.geometry.type !== 'MultiPolygon') return;

                                if (turf.booleanPointInPolygon(ponto, feat)) {
                                    const p = feat.properties;
                                    nomeUBS = p.Name || p.name || p.NOME || p.NO_FANTASIA || p.description || "Sem Nome";
                                    nomeUBS = nomeUBS.replace(/<[^>]*>?/gm, ''); 
                                    achouUBS = true;
                                }
                            });
                        }

                        const elUBS = document.getElementById('res-ubs');
                        if (elUBS) {
                            elUBS.innerText = nomeUBS;
                            if (achouUBS) elUBS.style.color = "#198754";
                            else elUBS.style.color = "#6c757d";
                        }
                    }
                    
                    results.style.display = 'block';
                } else {
                    alert("Endereço não encontrado.");
                }
            };

 
            if (cachedData) {
                console.log("Usando cache local");
                processarDados(JSON.parse(cachedData));
            } else {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}&email=wellingtonlb22@outlook.com`, {
                    headers: { "Accept-Language": "pt-BR" }
                })
                .then(res => res.json())
                .then(data => {
                    if (data && data.length > 0) {
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                        processarDados(data);
                    } else {
                        processarDados([]);
                    }
                })
                .catch(err => {
                    loading.style.display = 'none';
                    btn.style.display = 'block';
                    alert("Erro de conexão.");
                });
            }
        });
    }

 
    document.querySelectorAll('.btn-copy').forEach(btnCopy => {
        btnCopy.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const el = document.getElementById(targetId);
            if (el) {
                navigator.clipboard.writeText(el.innerText).then(() => {
                    const originalText = this.innerText;
                    this.innerText = "✓";
                    setTimeout(() => { this.innerText = originalText; }, 1500);
                });
            }
        });
    });
});