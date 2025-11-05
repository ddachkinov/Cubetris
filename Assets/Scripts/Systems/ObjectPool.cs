using UnityEngine;
using System.Collections.Generic;

namespace Cubetris
{
    /// <summary>
    /// Generic object pooling system for cubes and voxels.
    /// Improves performance by reusing objects instead of instantiating/destroying.
    /// </summary>
    public class ObjectPool : MonoBehaviour
    {
        public static ObjectPool Instance { get; private set; }

        [Header("Cube Pool Settings")]
        [SerializeField] private GameObject cubePrefab;
        [SerializeField] private int initialCubePoolSize = 50;
        [SerializeField] private int maxCubePoolSize = 200;
        [SerializeField] private Transform cubePoolParent;

        [Header("Voxel Pool Settings")]
        [SerializeField] private GameObject voxelPrefab;
        [SerializeField] private int initialVoxelPoolSize = 100;
        [SerializeField] private int maxVoxelPoolSize = 500;
        [SerializeField] private Transform voxelPoolParent;

        [Header("Pool Stats")]
        [SerializeField] private int activeCubes = 0;
        [SerializeField] private int activeVoxels = 0;

        // Pool storage
        private Queue<GameObject> cubePool = new Queue<GameObject>();
        private Queue<GameObject> voxelPool = new Queue<GameObject>();

        // Active object tracking
        private HashSet<GameObject> activeCubeSet = new HashSet<GameObject>();
        private HashSet<GameObject> activeVoxelSet = new HashSet<GameObject>();

        private void Awake()
        {
            // Singleton setup
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;

            // Create parent containers
            if (cubePoolParent == null)
            {
                GameObject cubeParent = new GameObject("CubePool");
                cubeParent.transform.parent = transform;
                cubePoolParent = cubeParent.transform;
            }

            if (voxelPoolParent == null)
            {
                GameObject voxelParent = new GameObject("VoxelPool");
                voxelParent.transform.parent = transform;
                voxelPoolParent = voxelParent.transform;
            }

            // Pre-populate pools
            InitializePools();
        }

        /// <summary>
        /// Initialize object pools with initial sizes.
        /// </summary>
        private void InitializePools()
        {
            // Create cube pool
            if (cubePrefab != null)
            {
                for (int i = 0; i < initialCubePoolSize; i++)
                {
                    CreateNewCube();
                }
                Debug.Log($"Initialized cube pool with {initialCubePoolSize} objects");
            }

            // Create voxel pool
            if (voxelPrefab != null)
            {
                for (int i = 0; i < initialVoxelPoolSize; i++)
                {
                    CreateNewVoxel();
                }
                Debug.Log($"Initialized voxel pool with {initialVoxelPoolSize} objects");
            }
        }

        #region Cube Pool

        /// <summary>
        /// Get a cube from the pool.
        /// </summary>
        public GameObject GetCube()
        {
            GameObject cube;

            // Try to get from pool
            if (cubePool.Count > 0)
            {
                cube = cubePool.Dequeue();
            }
            else
            {
                // Create new if pool is empty and under max size
                if (activeCubeSet.Count < maxCubePoolSize)
                {
                    cube = CreateNewCube();
                }
                else
                {
                    Debug.LogWarning("Cube pool at maximum capacity!");
                    return null;
                }
            }

            // Activate and track
            cube.SetActive(true);
            activeCubeSet.Add(cube);
            activeCubes = activeCubeSet.Count;

            return cube;
        }

        /// <summary>
        /// Return a cube to the pool.
        /// </summary>
        public void ReturnCube(GameObject cube)
        {
            if (cube == null) return;

            // Reset cube state
            CubeController controller = cube.GetComponent<CubeController>();
            if (controller != null)
            {
                controller.ResetCube();
            }

            // Deactivate and return to pool
            cube.SetActive(false);
            cube.transform.parent = cubePoolParent;
            cubePool.Enqueue(cube);

            // Remove from active tracking
            activeCubeSet.Remove(cube);
            activeCubes = activeCubeSet.Count;
        }

        /// <summary>
        /// Create a new cube object.
        /// </summary>
        private GameObject CreateNewCube()
        {
            if (cubePrefab == null)
            {
                Debug.LogError("Cube prefab not assigned to ObjectPool!");
                return null;
            }

            GameObject cube = Instantiate(cubePrefab, cubePoolParent);
            cube.SetActive(false);
            cubePool.Enqueue(cube);

            return cube;
        }

        #endregion

        #region Voxel Pool

        /// <summary>
        /// Get a voxel from the pool.
        /// </summary>
        public GameObject GetVoxel()
        {
            GameObject voxel;

            // Try to get from pool
            if (voxelPool.Count > 0)
            {
                voxel = voxelPool.Dequeue();
            }
            else
            {
                // Create new if pool is empty and under max size
                if (activeVoxelSet.Count < maxVoxelPoolSize)
                {
                    voxel = CreateNewVoxel();
                }
                else
                {
                    Debug.LogWarning("Voxel pool at maximum capacity!");
                    return null;
                }
            }

            // Activate and track
            voxel.SetActive(true);
            activeVoxelSet.Add(voxel);
            activeVoxels = activeVoxelSet.Count;

            return voxel;
        }

        /// <summary>
        /// Return a voxel to the pool.
        /// </summary>
        public void ReturnVoxel(GameObject voxel)
        {
            if (voxel == null) return;

            // Reset voxel state
            VoxelController controller = voxel.GetComponent<VoxelController>();
            if (controller != null)
            {
                controller.ResetVoxel();
            }

            // Deactivate and return to pool
            voxel.SetActive(false);
            voxel.transform.parent = voxelPoolParent;
            voxelPool.Enqueue(voxel);

            // Remove from active tracking
            activeVoxelSet.Remove(voxel);
            activeVoxels = activeVoxelSet.Count;
        }

        /// <summary>
        /// Create a new voxel object.
        /// </summary>
        private GameObject CreateNewVoxel()
        {
            if (voxelPrefab == null)
            {
                Debug.LogError("Voxel prefab not assigned to ObjectPool!");
                return null;
            }

            GameObject voxel = Instantiate(voxelPrefab, voxelPoolParent);
            voxel.SetActive(false);
            voxelPool.Enqueue(voxel);

            return voxel;
        }

        #endregion

        #region Pool Management

        /// <summary>
        /// Clear all pools and destroy objects.
        /// </summary>
        public void ClearAllPools()
        {
            // Clear cubes
            foreach (GameObject cube in cubePool)
            {
                if (cube != null) Destroy(cube);
            }
            foreach (GameObject cube in activeCubeSet)
            {
                if (cube != null) Destroy(cube);
            }
            cubePool.Clear();
            activeCubeSet.Clear();

            // Clear voxels
            foreach (GameObject voxel in voxelPool)
            {
                if (voxel != null) Destroy(voxel);
            }
            foreach (GameObject voxel in activeVoxelSet)
            {
                if (voxel != null) Destroy(voxel);
            }
            voxelPool.Clear();
            activeVoxelSet.Clear();

            activeCubes = 0;
            activeVoxels = 0;

            Debug.Log("All pools cleared");
        }

        /// <summary>
        /// Return all active objects to pools.
        /// </summary>
        public void ReturnAllToPool()
        {
            // Return all active cubes
            List<GameObject> cubesToReturn = new List<GameObject>(activeCubeSet);
            foreach (GameObject cube in cubesToReturn)
            {
                ReturnCube(cube);
            }

            // Return all active voxels
            List<GameObject> voxelsToReturn = new List<GameObject>(activeVoxelSet);
            foreach (GameObject voxel in voxelsToReturn)
            {
                ReturnVoxel(voxel);
            }

            Debug.Log("All active objects returned to pool");
        }

        #endregion

        // Public getters
        public int ActiveCubeCount => activeCubes;
        public int ActiveVoxelCount => activeVoxels;
        public int PooledCubeCount => cubePool.Count;
        public int PooledVoxelCount => voxelPool.Count;
    }
}
