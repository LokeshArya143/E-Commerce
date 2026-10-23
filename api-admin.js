(function(){
  var apiBase = String(window.RAMA_API_URL || '').replace(/\/+$/,'');
  var ownerToken = null;
  function api(path, options){
    options = options || {};
    var headers = Object.assign({'Content-Type':'application/json'}, options.headers || {});
    if(ownerToken) headers.Authorization = 'Bearer ' + ownerToken;
    return fetch(apiBase + path, Object.assign({}, options, {headers:headers})).then(function(response){
      if(response.status === 204) return null;
      return response.json().catch(function(){return {}}).then(function(data){
        if(!response.ok) throw new Error(data.error || 'Could not reach the store service.');
        return data;
      });
    });
  }
  function note(message){var el=document.getElementById('login-error');if(el)el.textContent=message}
  function refreshCatalog(){
    if(!apiBase)return;
    api('/api/products').then(function(list){
      if(Array.isArray(list)){ps=list;localStorage.setItem('rama_products',JSON.stringify(ps));render();renderCart();}
    }).catch(function(){});
  }
  function renderLogin(message){
    var root=document.getElementById('admin-content');
    root.innerHTML='<div class="login"><div class="eyebrow">Private owner access</div><h2>Sign in to your studio</h2><p>Sign in with the owner email and password configured for the store API. Product updates are shared with every visitor.</p>'+(!apiBase?'<p class="admin-notice">Store API address is not configured yet. Add it to api-config.js after creating the Render service.</p>':'')+'<form id="rama-login"><input name="email" type="email" autocomplete="username" required placeholder="Owner email"><input name="password" type="password" autocomplete="current-password" required placeholder="Owner password"><button class="btn" style="width:100%">Sign in</button><p id="login-error" role="alert">'+esc(message||'')+'</p></form></div>';
    document.getElementById('rama-login').onsubmit=function(e){
      e.preventDefault();var form=e.currentTarget,button=form.querySelector('button');button.disabled=true;button.textContent='Signing in…';
      api('/api/admin/login',{method:'POST',body:JSON.stringify({email:form.elements.email.value,password:form.elements.password.value})}).then(function(data){ownerToken=data.token;return api('/api/admin/products')}).then(function(list){ps=list;render();renderCart();renderAdmin()}).catch(function(error){button.disabled=false;button.textContent='Sign in';note(error.message)});
    };
  }
  function drawStudio(){
    var root=document.getElementById('admin-content');
    var rows=ps.map(function(p){return '<tr><td>'+esc(p.name)+'</td><td>'+esc(p.type||'Saree')+'</td><td>'+esc(p.fabric)+' · '+esc(p.color)+'</td><td>'+esc(p.quality||'—')+'</td><td>'+money(p.price)+'</td><td>'+(p.stock===false?'Unavailable':'In stock')+'</td><td><button type="button" data-edit="'+esc(p.id)+'">Edit</button> · <button type="button" data-remove="'+esc(p.id)+'">Remove</button></td></tr>'}).join('');
    root.innerHTML='<div class="admin-notice"><b>Connected owner studio · '+ps.length+' products</b><br>Catalog changes are saved to the shared store database. Add product photos from your camera or device; use photos of the exact item being sold.</div><div class="admin-box"><h2 id="form-heading">Add a saree or dress</h2><form id="rama-product-form" class="admin-form"><input name="name" required placeholder="Product name"><select name="type"><option>Saree</option><option>Dress</option></select><select name="fabric"><option>Silk</option><option>Cotton</option><option>Georgette</option><option>Chiffon</option><option>Banarasi silk</option><option>Linen blend</option></select><select name="color"><option>Pink</option><option>Gold</option><option>Blue</option><option>Red</option><option>Green</option></select><select name="occasion"><option>Celebration</option><option>Festive</option><option>Everyday</option><option>Bridal</option></select><input name="price" type="number" min="1" required placeholder="Price ₹"><input name="quality" placeholder="Quality / finish notes"><input name="tag" placeholder="Collection label"><input name="img" type="url" placeholder="HTTPS model photo URL"><div class="photo-actions"><button type="button" class="photo-button" id="rama-camera">Open camera</button><button type="button" class="photo-button" id="rama-photo-picker">Choose photo</button><span id="photo-status" aria-live="polite">JPEG photos are compressed before upload.</span></div><input id="rama-camera-file" type="file" accept="image/*" capture="environment" hidden><input id="rama-photo-file" type="file" accept="image/*" hidden><select name="stock"><option value="true">In stock</option><option value="false">Unavailable</option></select><textarea name="details" placeholder="Product description"></textarea><input name="id" type="hidden"><button class="btn wide">Save product</button><button type="button" class="wide" id="rama-clear">Clear form</button></form><img id="image-preview" style="display:none;max-height:260px;max-width:100%;margin-top:15px;object-fit:cover;border-radius:12px" alt="Product image preview"></div><div class="admin-box"><h2>Your catalog</h2><div style="overflow:auto"><table class="admin-table"><thead><tr><th>Product</th><th>Type</th><th>Fabric / colour</th><th>Quality</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div class="admin-box"><button id="rama-signout">Sign out</button></div>';
    var form=document.getElementById('rama-product-form');
    var imagePreview=document.getElementById('image-preview'),photoStatus=document.getElementById('photo-status'),photoDataUrl='';
    function setPhotoRequired(){form.elements.img.required=!photoDataUrl&&!form.elements.id.value}
    setPhotoRequired();
    function compressPhoto(file){return new Promise(function(resolve,reject){var source=new Image(),objectUrl=URL.createObjectURL(file);source.onload=function(){URL.revokeObjectURL(objectUrl);var scale=Math.min(1,1200/Math.max(source.naturalWidth,source.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);canvas.toBlob(function(blob){if(!blob){reject(new Error('Could not prepare this photo.'));return}function read(imageBlob){var reader=new FileReader();reader.onload=function(){resolve(reader.result)};reader.onerror=function(){reject(new Error('Could not read this photo.'))};reader.readAsDataURL(imageBlob)}if(blob.size>500*1024){canvas.toBlob(function(smaller){if(!smaller||smaller.size>500*1024){reject(new Error('Choose a smaller photo and try again.'));return}read(smaller)},'image/jpeg',0.68);return}read(blob)},'image/jpeg',0.82)};source.onerror=function(){URL.revokeObjectURL(objectUrl);reject(new Error('This image could not be opened.'))};source.src=objectUrl})}
    function preparePhoto(input){var file=input.files&&input.files[0];if(!file)return;if(!/^image\//.test(file.type)){toast('Choose an image file');return}photoStatus.textContent='Preparing photo…';compressPhoto(file).then(function(dataUrl){photoDataUrl=dataUrl;imagePreview.src=dataUrl;imagePreview.style.display='block';photoStatus.textContent='Photo ready · '+Math.round(dataUrl.length*0.75/1024)+' KB';setPhotoRequired()}).catch(function(error){photoDataUrl='';photoStatus.textContent=error.message;setPhotoRequired()})}
    document.getElementById('rama-camera').onclick=function(){document.getElementById('rama-camera-file').click()};
    document.getElementById('rama-photo-picker').onclick=function(){document.getElementById('rama-photo-file').click()};
    document.getElementById('rama-camera-file').onchange=function(){preparePhoto(this)};
    document.getElementById('rama-photo-file').onchange=function(){preparePhoto(this)};
    form.elements.img.addEventListener('input',function(){photoDataUrl='';imagePreview.src=this.value;imagePreview.style.display=this.value?'block':'none';photoStatus.textContent='JPEG photos are compressed before upload.';setPhotoRequired()});
    document.getElementById('rama-clear').onclick=function(){form.reset();form.elements.id.value='';photoDataUrl='';photoStatus.textContent='JPEG photos are compressed before upload.';form.elements.img.required=true;document.getElementById('rama-camera-file').value='';document.getElementById('rama-photo-file').value='';document.getElementById('form-heading').textContent='Add a saree or dress';imagePreview.style.display='none'};
    document.getElementById('rama-signout').onclick=function(){ownerToken=null;renderLogin('You have signed out.')};
    form.onsubmit=function(e){
      e.preventDefault();var data=Object.fromEntries(new FormData(form));var id=data.id;
      var payload={name:data.name,type:data.type,fabric:data.fabric,color:data.color,occasion:data.occasion,price:Number(data.price),quality:data.quality,tag:data.tag,img:data.img||(id?((ps.find(function(p){return p.id===id})||{}).img||''):modelPhotos[0]),stock:data.stock==='true',details:data.details};
      var saveButton=form.querySelector('.btn');saveButton.disabled=true;saveButton.textContent='Saving…';
      api(id?'/api/admin/products/'+encodeURIComponent(id):'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)}).then(function(saved){form.elements.id.value=saved.id;form.elements.img.value=saved.img;if(!photoDataUrl)return saved;return api('/api/admin/products/'+encodeURIComponent(saved.id)+'/image',{method:'POST',body:JSON.stringify({dataUrl:photoDataUrl})}).then(function(){return saved})}).then(function(){return api('/api/admin/products')}).then(function(list){ps=list;render();renderCart();renderAdmin();toast('Product saved to the shared catalog')}).catch(function(error){saveButton.disabled=false;saveButton.textContent='Save product';toast(error.message)});
    };
    root.onclick=function(e){
      var edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');
      if(edit){var p=ps.find(function(x){return x.id===edit.dataset.edit});if(!p)return;photoDataUrl='';document.getElementById('rama-camera-file').value='';document.getElementById('rama-photo-file').value='';photoStatus.textContent='JPEG photos are compressed before upload.';['name','type','fabric','color','occasion','price','quality','tag','img','stock','details','id'].forEach(function(k){if(form.elements[k])form.elements[k].value=p[k]===undefined?'':p[k]});form.elements.stock.value=p.stock===false?'false':'true';setPhotoRequired();document.getElementById('form-heading').textContent='Edit '+p.name;imagePreview.src=p.img;imagePreview.style.display='block';form.scrollIntoView({behavior:'smooth'})}
      if(remove){var product=ps.find(function(x){return x.id===remove.dataset.remove});if(!product||!confirm('Remove '+product.name+' from the shared catalog?'))return;api('/api/admin/products/'+encodeURIComponent(product.id),{method:'DELETE'}).then(function(){return api('/api/admin/products')}).then(function(list){ps=list;render();renderCart();renderAdmin()}).catch(function(error){toast(error.message)})}
    };
  }
  window.renderAdmin=function(){if(ownerToken)drawStudio();else renderLogin('')};
  window.addEventListener('hashchange',function(){if(location.hash==='#admin')window.renderAdmin()});
  if(location.hash==='#admin')window.renderAdmin();
  refreshCatalog();
})();
