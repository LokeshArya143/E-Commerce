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
    root.innerHTML='<div class="admin-notice"><b>Connected owner studio · '+ps.length+' products</b><br>Catalog changes are saved to the shared store database. Sample descriptions and photos should be verified before launch.</div><div class="admin-box"><h2 id="form-heading">Add a saree or dress</h2><form id="rama-product-form" class="admin-form"><input name="name" required placeholder="Product name"><select name="type"><option>Saree</option><option>Dress</option></select><select name="fabric"><option>Silk</option><option>Cotton</option><option>Georgette</option><option>Chiffon</option><option>Banarasi silk</option><option>Linen blend</option></select><select name="color"><option>Pink</option><option>Gold</option><option>Blue</option><option>Red</option><option>Green</option></select><select name="occasion"><option>Celebration</option><option>Festive</option><option>Everyday</option><option>Bridal</option></select><input name="price" type="number" min="1" required placeholder="Price ₹"><input name="quality" placeholder="Quality / finish notes"><input name="tag" placeholder="Collection label"><input name="img" type="url" required placeholder="HTTPS model photo URL"><select name="stock"><option value="true">In stock</option><option value="false">Unavailable</option></select><textarea name="details" placeholder="Product description"></textarea><input name="id" type="hidden"><button class="btn wide">Save product</button><button type="button" class="wide" id="rama-clear">Clear form</button></form><img id="image-preview" style="display:none;max-height:190px;max-width:100%;margin-top:15px;object-fit:cover" alt="Product image preview"></div><div class="admin-box"><h2>Your catalog</h2><div style="overflow:auto"><table class="admin-table"><thead><tr><th>Product</th><th>Type</th><th>Fabric / colour</th><th>Quality</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div class="admin-box"><button id="rama-signout">Sign out</button></div>';
    var form=document.getElementById('rama-product-form');
    form.elements.img.addEventListener('input',function(){var image=document.getElementById('image-preview');image.src=this.value;image.style.display=this.value?'block':'none'});
    document.getElementById('rama-clear').onclick=function(){form.reset();form.elements.id.value='';document.getElementById('form-heading').textContent='Add a saree or dress';document.getElementById('image-preview').style.display='none'};
    document.getElementById('rama-signout').onclick=function(){ownerToken=null;renderLogin('You have signed out.')};
    form.onsubmit=function(e){
      e.preventDefault();var data=Object.fromEntries(new FormData(form));var id=data.id;
      var payload={name:data.name,type:data.type,fabric:data.fabric,color:data.color,occasion:data.occasion,price:Number(data.price),quality:data.quality,tag:data.tag,img:data.img,stock:data.stock==='true',details:data.details};
      api(id?'/api/admin/products/'+encodeURIComponent(id):'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)}).then(function(){return api('/api/admin/products')}).then(function(list){ps=list;render();renderCart();renderAdmin();toast('Product saved to the shared catalog')}).catch(function(error){toast(error.message)});
    };
    root.onclick=function(e){
      var edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');
      if(edit){var p=ps.find(function(x){return x.id===edit.dataset.edit});if(!p)return;['name','type','fabric','color','occasion','price','quality','tag','img','stock','details','id'].forEach(function(k){if(form.elements[k])form.elements[k].value=p[k]===undefined?'':p[k]});form.elements.stock.value=p.stock===false?'false':'true';document.getElementById('form-heading').textContent='Edit '+p.name;var image=document.getElementById('image-preview');image.src=p.img;image.style.display='block';form.scrollIntoView({behavior:'smooth'})}
      if(remove){var product=ps.find(function(x){return x.id===remove.dataset.remove});if(!product||!confirm('Remove '+product.name+' from the shared catalog?'))return;api('/api/admin/products/'+encodeURIComponent(product.id),{method:'DELETE'}).then(function(){return api('/api/admin/products')}).then(function(list){ps=list;render();renderCart();renderAdmin()}).catch(function(error){toast(error.message)})}
    };
  }
  window.renderAdmin=function(){if(ownerToken)drawStudio();else renderLogin('')};
  window.addEventListener('hashchange',function(){if(location.hash==='#admin')window.renderAdmin()});
  if(location.hash==='#admin')window.renderAdmin();
  refreshCatalog();
})();
