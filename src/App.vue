<script setup lang="ts">
import '@lib/assets/style/index.scss'
import VueGiantTree from '@lib/VueGiantTree.vue'

import { nanoid } from 'nanoid'
import { ref } from 'vue'

// add(1, 2);

let testData = []
const rootId = nanoid()
const pid = rootId
const result = ref([])
for (let i = 0; i < 10; i++) {
  const id1 = nanoid()
  let level1 = {
    id: id1,
    parentId: rootId,
    name: id1,
  }
  testData.push(level1)

  for (let j = 0; j < 10; j++) {
    const id2 = nanoid()
    let level2 = {
      id: id2,
      parentId: id1,
      name: id2,
    }
    testData.push(level2)

    for (let z = 0; z < 10; z++) {
      const id3 = nanoid()
      let level3 = {
        id: id3,
        parentId: id2,
        name: id3,
      }
      testData.push(level3)
    }
  }
}
console.log(testData)
// const tree = newTree(pid, 20, SelectType.SELECT)
// let startTime, endTime
//
// startTime = Date.now()
// clear(tree)
// for (let i = 0; i < testData.length; i++) {
//   pushNeighborNode(tree, testData[i].id, testData[i].name, testData[i].parentId)
// }
// popNeighbor(tree)
// endTime = Date.now()
// console.log('test time:', endTime - startTime)
// const treeJsonStr=JSON.stringify(testData)
// let startTime = new Date().getTime();
// setNeighborTree(tree,treeJsonStr)
// let endTime = new Date().getTime();
// console.log("setNeighborTree time:", endTime - startTime);
// console.log("size：", getSize(tree));

// startTime = new Date().getTime();
// const listStr = getShownNodes(tree, 0, 100)
// console.log(JSON.parse(listStr))
// endTime = new Date().getTime();
// console.log("Shown time:", endTime - startTime);
</script>

<template>
  <!--  <div>-->
  <!--    <a href="https://vite.dev" target="_blank">-->
  <!--      <img src="/vite.svg" class="logo" alt="Vite logo" />-->
  <!--    </a>-->
  <!--    <a href="https://vuejs.org/" target="_blank">-->
  <!--      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />-->
  <!--    </a>-->
  <!--  </div>-->
  <!--  <HelloWorld msg="Vite + Vue" />-->
  <div style="width: 300px; height: 500px">
    <VueGiantTree :tree="testData" :root="pid" v-model="result" />
  </div>
  {{ result }}
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
