const fs = require('fs')
const path = require('path')
const babylon = require('babylon')
const trasverse = require('babel-traverse').default
const { transformFromAst } = require('babel-core')

let ID = 0
function createAsset(filename) {
  const content = fs.readFileSync(filename, 'utf-8')
  const ast = babylon.parse(content, { sourceType: 'module' })
  const dependencies = []

  trasverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value)
    }
  })

  const id = ID++;
  const { code } = transformFromAst(ast, null, { presets: ["env"] })
  return { id, filename, dependencies, code }
}

function createGraph(entry){
  const mainAsset = createAsset(entry)
  const queue = [mainAsset]
  
  for(const asset of queue){
     asset.mapping = {}
     const dirname = path.dirname(asset.filename)
     asset.dependencies.forEach(relativePath => {
       const absolutePath = path.join(dirname, relativePath)
       const child = createAsset(absolutePath)
       asset.mapping[relativePath] = child.id
       queue.push(child)
     })
  }
  return queue
}


function bundle(graph){
  let modules = ''
  graph.forEach(mod => {
    modules += `${mod.id}:[function(require, module,exports){
      ${mod.code}
    },
    ${JSON.stringify(mod.mapping)}
  ],`
  })
  // \  console.log('modules', modules)
  // return modules

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];
        function localRequire(name) {
          return require(mapping[name]);  // 这里的require函数 就是上面modules中传递的require参数
        }
        const module = { exports : {} };
        fn(localRequire, module, module.exports);        
        return module.exports;
      }
      require(0);
    })({${modules}})
  `;
  return result
}

const graph = createGraph('./src/main.js')

const existsDist = fs.existsSync(path.join(__dirname, 'dist'));
if(!existsDist){
  fs.mkdirSync(path.join(__dirname, 'dist'), {recursive: false})
}

const result = bundle(graph)
fs.writeFileSync('./dist/bundle.js', result, 'utf-8')