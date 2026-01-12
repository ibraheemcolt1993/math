document.getElementById("btn").onclick = function(){
  const id = document.getElementById("nid").value.trim();
  if(!id){
    alert("أدخل رقم الهوية");
    return;
  }
  alert("أهلًا بك، رقمك: " + id);
};
